import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { accounts, can, type Permission, type SessionUser } from "@sb/core";
import { cache } from "react";

export const SESSION_COOKIE = "sb_session";

/** Current user or null. Cached per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await accounts.getSessionUser(token);
  if (user) {
    const h = await headers();
    user.ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  }
  return user;
});

/**
 * Server-side permission gate. Call at the top of EVERY page, server action and
 * route handler — hiding buttons is not security.
 */
export async function requireRole(perm: Permission): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password?first=1");
  if (!can(user.role, perm)) redirect("/?denied=1");
  return user;
}

/** For route handlers: returns a Response instead of redirecting. */
export async function apiUser(perm: Permission): Promise<SessionUser | Response> {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, perm)) return new Response("Forbidden", { status: 403 });
  return user;
}
