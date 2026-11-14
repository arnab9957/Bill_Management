import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "@sb/core";
import { fieldErrors, z } from "@sb/validation";

export type ActionState = { ok: boolean; message?: string; errors?: Record<string, string>; data?: unknown } | null;

/**
 * Run a mutation and turn validation/business errors into form feedback.
 * Redirects and notFound() pass through.
 */
export async function run<T>(fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<ActionState> {
  try {
    const r = await fn();
    return { ok: true, message: typeof success === "function" ? success(r) : success ?? "Saved", data: r as unknown };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof z.ZodError) return { ok: false, message: "Please correct the highlighted fields", errors: fieldErrors(e) };
    if (e instanceof AppError) return { ok: false, message: e.message, errors: e.fields };
    const pgCode = (e as { code?: string })?.code;
    if (pgCode === "23505") return { ok: false, message: "This record already exists (duplicate)." };
    if (pgCode === "23514") return { ok: false, message: "That change would break a financial rule and was blocked." };
    console.error(e);
    return { ok: false, message: "Something went wrong. The error was logged." };
  }
}

/** FormData → plain object; repeated keys become arrays; dotted keys nest one level (guardian.name). */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v;
    const [a, b] = k.split(".");
    if (b && a) {
      const obj = (out[a] ??= {}) as Record<string, unknown>;
      obj[b] = val;
    } else if (k in out) {
      out[k] = ([] as unknown[]).concat(out[k], val);
    } else out[k] = val;
  }
  return out;
}

export const num = (v: FormDataEntryValue | null | undefined) => (v == null || v === "" ? undefined : Number(v));
