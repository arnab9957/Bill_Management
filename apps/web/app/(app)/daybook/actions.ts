"use server";
import { revalidatePath } from "next/cache";
import { formatINR, payments } from "@sb/core";
import { denominations } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";

export async function closeDayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireRole("dayClose");
  const counts = Object.fromEntries(denominations.map((d) => [d, Number(fd.get(`d${d}`) || 0)]));
  const r = await run(() => payments.closeDay(u, { date: fd.get("date"), counts }), (x) => `Day closed. Difference ${formatINR(x.difference)}`);
  revalidatePath("/daybook");
  // Only plain data back to the client.
  return r ? { ok: r.ok, message: r.message, errors: r.errors } : r;
}
