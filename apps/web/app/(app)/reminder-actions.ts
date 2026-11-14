"use server";
import { revalidatePath } from "next/cache";
import { notifications } from "@sb/core";
import type { Channel } from "@sb/db";
import { requireRole } from "@/lib/auth";
import { wakeDispatcher } from "@/lib/boss";

const LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", email: "Email", sms: "SMS" };

/** Manual reminder on one channel (or all) for one or more students. */
export async function sendReminderAction(studentIds: number[], channels: Channel[]): Promise<{ ok: boolean; message: string }> {
  const u = await requireRole("notifications");
  const valid = channels.filter((c): c is Channel => c in LABEL);
  if (!studentIds.length || !valid.length) return { ok: false, message: "Nothing to send" };
  try {
    const n = await notifications.sendReminderNow(u, studentIds, valid);
    if (n === 0) return { ok: false, message: "Not sent: no unpaid bills, or the parent can't be reached on this channel." };
    const woke = await wakeDispatcher();
    for (const id of studentIds) revalidatePath(`/students/${id}`);
    revalidatePath("/notifications");
    const what = valid.length === 3 ? "SMS, WhatsApp & Email" : valid.map((c) => LABEL[c]).join(" & ");
    return { ok: true, message: woke ? `${what} reminder sending now (${n} message${n > 1 ? "s" : ""})` : `${what} reminder queued — it goes out when the worker runs` };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Could not queue the reminder" };
  }
}
