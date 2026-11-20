"use server";
import { revalidatePath } from "next/cache";
import { notifications, getProviderConfig } from "@sb/core";
import type { Channel } from "@sb/db";
import { requireRole } from "@/lib/auth";
import { wakeDispatcher } from "@/lib/boss";

const LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", email: "Email", sms: "SMS" };

/** Manual reminder on one channel (or all) for one or more students. */
export async function sendReminderAction(studentIds: number[], channels: Channel[]): Promise<{ ok: boolean; message: string; whatsappLinks?: string[] }> {
  const u = await requireRole("notifications");
  const valid = channels.filter((c): c is Channel => c in LABEL);
  if (!studentIds.length || !valid.length) return { ok: false, message: "Nothing to send" };
  try {
    const cfg = await getProviderConfig();
    const wantsWhatsapp = valid.includes("whatsapp");
    const whatsappDevice = wantsWhatsapp && cfg.whatsappMode === "device";
    const queuedChannels = valid.filter((c) => !(c === "whatsapp" && whatsappDevice));
    let queued = 0;
    if (queuedChannels.length) queued = await notifications.sendReminderNow(u, studentIds, queuedChannels);
    let whatsappLinks: string[] = [];
    if (whatsappDevice) {
      whatsappLinks = (await notifications.getManualWhatsappLinks(studentIds)).map((l) => l.url);
    }
    if (!queued && !whatsappLinks.length) return { ok: false, message: "Not sent: no unpaid bills, or the parent can't be reached on this channel." };
    let woke = false;
    if (queued) woke = await wakeDispatcher();
    if (queued || whatsappLinks.length) {
      for (const id of studentIds) revalidatePath(`/students/${id}`);
      revalidatePath("/notifications");
    }
    const parts: string[] = [];
    if (queuedChannels.length && queued) {
      const what = queuedChannels.length === 3 ? "SMS, WhatsApp & Email" : queuedChannels.map((c) => LABEL[c]).join(" & ");
      parts.push(woke ? `${what} reminder sending now (${queued} message${queued > 1 ? "s" : ""})` : `${what} reminder queued — it goes out when the worker runs`);
    }
    if (whatsappLinks.length) parts.push(`Opening WhatsApp for ${whatsappLinks.length} chat${whatsappLinks.length > 1 ? "s" : ""} on this device`);
    return { ok: true, message: parts.join(". ") || "Reminder prepared", whatsappLinks: whatsappLinks.length ? whatsappLinks : undefined };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Could not prepare the reminder" };
  }
}
