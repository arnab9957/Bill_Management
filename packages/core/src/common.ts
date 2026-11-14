import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auditLog, numberSeries, schoolSettings, academicYears, env, getDb, type Executor, type Role } from "@sb/db";
import { providerConfigSchema, type ProviderConfig } from "@sb/validation";

/** Who is acting. `id: null` = the system (worker jobs). */
export interface Actor {
  id: number | null;
  role: Role | "SYSTEM";
  username: string;
  fullName: string;
  ip?: string;
}
export const SYSTEM: Actor = { id: null, role: "SYSTEM", username: "system", fullName: "System" };

/** Expected business error, safe to show to the user. */
export class AppError extends Error {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
  }
}

// ---------------------------------------------------------------- audit
export async function audit(
  tx: Executor,
  actor: Actor,
  action: string,
  tableName: string,
  recordId: string | number | null,
  oldValues?: unknown,
  newValues?: unknown,
): Promise<void> {
  await tx.insert(auditLog).values({
    userId: actor.id,
    action,
    tableName,
    recordId: recordId == null ? null : String(recordId),
    oldValues: oldValues ?? null,
    newValues: newValues ?? null,
    ip: actor.ip ?? null,
  });
}

// ---------------------------------------------------------------- numbering
/**
 * Gap-free number from a locked counter row. Must run inside the same
 * transaction as the insert that uses it: on rollback the number is released.
 */
export async function nextNumber(tx: Executor, series: string): Promise<number> {
  const res = await tx
    .insert(numberSeries)
    .values({ key: series, lastValue: 1 })
    .onConflictDoUpdate({ target: numberSeries.key, set: { lastValue: sql`${numberSeries.lastValue} + 1` } })
    .returning({ v: numberSeries.lastValue });
  return res[0]!.v;
}
export const formatDocNo = (prefix: string, yearName: string, n: number) => `${prefix}/${yearName}/${String(n).padStart(6, "0")}`;

// ---------------------------------------------------------------- settings
export async function getSettings(db: Executor = getDb()) {
  const [row] = await db.select().from(schoolSettings).where(eq(schoolSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(schoolSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schoolSettings).where(eq(schoolSettings.id, 1)))[0]!;
}

export async function getCurrentYear(db: Executor = getDb()) {
  const [y] = await db.select().from(academicYears).where(eq(academicYears.isCurrent, true));
  if (!y) throw new AppError("No current academic year is set. Configure it under Settings → Academic years.");
  return y;
}

/** Find the academic year that contains a date. */
export async function yearForDate(db: Executor, date: string) {
  const [y] = await db.select().from(academicYears)
    .where(sql`${academicYears.startDate} <= ${date} and ${academicYears.endDate} >= ${date}`);
  if (!y) throw new AppError(`No academic year covers ${date}.`);
  return y;
}

// ---------------------------------------------------------------- secrets at rest
const key = () => createHash("sha256").update(env().APP_SECRET).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString("utf8");
}

export async function getProviderConfig(db: Executor = getDb()): Promise<ProviderConfig> {
  const s = await getSettings(db);
  if (!s.providerConfigEnc) return providerConfigSchema.parse({});
  try {
    return providerConfigSchema.parse(JSON.parse(decryptSecret(s.providerConfigEnc)));
  } catch {
    return providerConfigSchema.parse({});
  }
}

export async function saveProviderConfig(db: Executor, actor: Actor, cfg: ProviderConfig) {
  await getSettings(db);
  await db.update(schoolSettings).set({ providerConfigEnc: encryptSecret(JSON.stringify(cfg)) }).where(eq(schoolSettings.id, 1));
  await audit(db, actor, "update", "provider_config", 1, null, { modes: [cfg.emailMode, cfg.whatsappMode, cfg.smsMode] });
}

export async function updateSchoolSettings(actor: Actor, input: unknown) {
  const { schoolSettingsSchema } = await import("@sb/validation");
  const d = schoolSettingsSchema.parse(input);
  const db = getDb();
  const old = await getSettings(db);
  await db.update(schoolSettings).set({ ...d, upiId: d.upiId || null, backupPath: d.backupPath || null }).where(eq(schoolSettings.id, 1));
  await audit(db, actor, "update", "school_settings", 1, { ...old, providerConfigEnc: undefined }, d);
}
