import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, lt } from "drizzle-orm";
import { getDb, sessions, users, env, type Role } from "@sb/db";
import { changePasswordSchema, loginSchema, userSchema, passwordSchema } from "@sb/validation";
import { AppError, audit, type Actor } from "../common";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionUser extends Actor {
  id: number;
  role: Role;
  mustChangePassword: boolean;
}

export async function login(input: unknown, ip?: string): Promise<{ token: string; user: SessionUser }> {
  const { username, password } = loginSchema.parse(input);
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
  const generic = new AppError("Invalid username or password");
  if (!u || !u.isActive) {
    await hash(password); // equalise timing
    throw generic;
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    throw new AppError(`Account locked after ${MAX_FAILED} failed attempts. Try again after ${u.lockedUntil.toLocaleTimeString("en-IN")} or ask an admin.`);
  }
  if (!(await verify(u.passwordHash, password))) {
    const attempts = u.failedAttempts + 1;
    await db.update(users).set({
      failedAttempts: attempts,
      lockedUntil: attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    }).where(eq(users.id, u.id));
    await audit(db, { id: u.id, role: u.role, username: u.username, fullName: u.fullName, ip }, "login_failed", "app_user", u.id);
    throw generic;
  }
  await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: sha(token), userId: u.id, ip: ip ?? null });
  const user: SessionUser = { id: u.id, role: u.role, username: u.username, fullName: u.fullName, mustChangePassword: u.mustChangePassword, ip };
  await audit(db, user, "login", "app_user", u.id);
  return { token, user };
}

/** Resolve a cookie token to a user, enforcing the idle timeout. Refreshes last-seen. */
export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const db = getDb();
  const id = sha(token);
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, id));
  if (!row || !row.u.isActive) return null;
  const idleMs = env().SESSION_IDLE_MINUTES * 60_000;
  if (Date.now() - row.s.lastSeenAt.getTime() > idleMs) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  return { id: row.u.id, role: row.u.role, username: row.u.username, fullName: row.u.fullName, mustChangePassword: row.u.mustChangePassword, ip: row.s.ip ?? undefined };
}

export async function logout(token: string | undefined) {
  if (token) await getDb().delete(sessions).where(eq(sessions.id, sha(token)));
}

export async function purgeExpiredSessions() {
  const cutoff = new Date(Date.now() - env().SESSION_IDLE_MINUTES * 60_000);
  await getDb().delete(sessions).where(lt(sessions.lastSeenAt, cutoff));
}

export async function changePassword(actor: SessionUser, input: unknown) {
  const d = changePasswordSchema.parse(input);
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, actor.id));
  if (!u || !(await verify(u.passwordHash, d.current))) throw new AppError("Current password is incorrect", { current: "Incorrect" });
  if (d.current === d.next) throw new AppError("New password must be different", { next: "Must differ from current" });
  await db.update(users).set({ passwordHash: await hash(d.next), mustChangePassword: false }).where(eq(users.id, u.id));
  await audit(db, actor, "change_password", "app_user", u.id);
}

export async function listUsers() {
  return getDb().select({
    id: users.id, username: users.username, fullName: users.fullName, role: users.role,
    isActive: users.isActive, lockedUntil: users.lockedUntil, createdAt: users.createdAt,
  }).from(users).orderBy(users.username);
}

export async function createUser(actor: Actor, input: unknown) {
  const d = userSchema.parse(input);
  const db = getDb();
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.username, d.username.toLowerCase()));
  if (exists.length) throw new AppError("Username already exists", { username: "Already taken" });
  const [u] = await db.insert(users).values({
    username: d.username.toLowerCase(), fullName: d.fullName, role: d.role, passwordHash: await hash(d.password), mustChangePassword: true,
  }).returning({ id: users.id });
  await audit(db, actor, "create", "app_user", u!.id, null, { username: d.username, role: d.role });
  return u!;
}

export async function setUserActive(actor: Actor, userId: number, isActive: boolean) {
  if (actor.id === userId && !isActive) throw new AppError("You cannot deactivate yourself");
  const db = getDb();
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
  if (!isActive) await db.delete(sessions).where(eq(sessions.userId, userId));
  await audit(db, actor, isActive ? "activate" : "deactivate", "app_user", userId);
}

export async function resetUserPassword(actor: Actor, userId: number, newPassword: string) {
  const pw = passwordSchema.parse(newPassword);
  const db = getDb();
  await db.update(users).set({ passwordHash: await hash(pw), mustChangePassword: true, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
  await db.delete(sessions).where(and(eq(sessions.userId, userId)));
  await audit(db, actor, "reset_password", "app_user", userId);
}

/** Menu permissions per role — the UI uses this to hide links; the server re-checks with requireRole(). */
export const ROLE_ACCESS = {
  dashboard: ["ADMIN", "ACCOUNTANT", "CASHIER", "PRINCIPAL"],
  collect: ["ADMIN", "ACCOUNTANT", "CASHIER"],
  students: ["ADMIN", "ACCOUNTANT", "CASHIER", "PRINCIPAL"],
  studentsEdit: ["ADMIN", "ACCOUNTANT"],
  fees: ["ADMIN", "ACCOUNTANT"],
  billing: ["ADMIN", "ACCOUNTANT"],
  receiptsCancel: ["ADMIN", "ACCOUNTANT"],
  reports: ["ADMIN", "ACCOUNTANT", "PRINCIPAL"],
  dayClose: ["ADMIN", "ACCOUNTANT", "CASHIER"],
  notifications: ["ADMIN", "ACCOUNTANT"],
  settings: ["ADMIN"],
  audit: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof ROLE_ACCESS;
export const can = (role: Role, perm: Permission) => (ROLE_ACCESS[perm] as readonly Role[]).includes(role);
