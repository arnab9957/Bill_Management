import { and, eq, inArray, lte, sql, gt, ne, desc } from "drizzle-orm";
import {
  getDb, guardians, studentGuardians, students, classes, invoices, notificationOutbox, notificationTemplates,
  type Channel, type Executor, type NotifyEvent, type OutboxRow,
} from "@sb/db";
import { getSettings, audit, type Actor, SYSTEM } from "../common";
import { addDays, daysBetween, formatDate, today, type ISODate } from "../dates";
import { formatINR } from "../money";

export const CHANNELS: Channel[] = ["whatsapp", "email", "sms"];
const REMINDER_EVENTS: NotifyEvent[] = ["DUE_UPCOMING", "DUE_TODAY", "OVERDUE"];

// ---------------------------------------------------------------- rendering
/** Replace {placeholders}; unknown placeholders are left visible so mistakes are caught in preview. */
export function renderTemplate(body: string, vars: Record<string, string | number | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : String(vars[k])));
}
export const PLACEHOLDERS = [
  "guardian_name", "student_name", "class", "amount_due", "due_date", "invoice_no", "school_name", "school_phone",
  "dues_detail", "amount_paid", "receipt_no", "balance", "cheque_no", "bounce_charge", "late_fee",
] as const;

// ---------------------------------------------------------------- adapters contract
export interface OutboundMessage {
  id: number;
  channel: Channel;
  recipient: string;
  subject: string | null;
  body: string;
  providerTemplateId: string | null;
  templateParams: Record<string, string> | null;
  attachmentPath: string | null;
}
export type SendResult = { ok: true; providerMsgId?: string } | { ok: false; error: string; permanent?: boolean };
export interface NotificationAdapter {
  send(msg: OutboundMessage): Promise<SendResult>;
}

// ---------------------------------------------------------------- enqueue
interface EnqueueArgs {
  event: NotifyEvent;
  /** e.g. "BILL_GENERATED:inv:123" — channel is appended. Unique forever. */
  keyBase: string;
  studentIds: number[];
  invoiceIds?: number[];
  vars: Record<string, string>;
  expiresAt?: Date;
  attachmentPath?: string;
  /** Limit to these channels (manual "send by WhatsApp" etc.). Default: all enabled. */
  channels?: Channel[];
}

/**
 * Write one message per enabled channel for the primary guardian of the first
 * student into the outbox. Idempotent: same keyBase → no new rows.
 * Never talks to the internet; the worker's dispatcher sends later.
 */
export async function enqueue(tx: Executor, a: EnqueueArgs): Promise<number> {
  const firstStudent = a.studentIds[0];
  if (firstStudent === undefined) return 0;
  const [g] = await tx.select({ g: guardians }).from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, firstStudent))
    .orderBy(desc(studentGuardians.isPrimary)).limit(1);
  if (!g || !g.g.messagingConsent) return 0;
  const guardian = g.g;
  const settings = await getSettings(tx);
  const templates = await tx.select().from(notificationTemplates)
    .where(and(eq(notificationTemplates.event, a.event), eq(notificationTemplates.isActive, true)));

  const vars = { guardian_name: guardian.name, school_name: settings.name, school_phone: settings.phone, ...a.vars };
  let count = 0;
  for (const channel of a.channels ?? CHANNELS) {
    const recipient = channel === "sms" ? (guardian.notifySms ? guardian.mobile : null)
      : channel === "whatsapp" ? (guardian.notifyWhatsapp ? guardian.whatsappNo ?? guardian.mobile : null)
      : guardian.notifyEmail ? guardian.email : null;
    if (!recipient) continue;
    const t = templates.find((x) => x.channel === channel && x.language === guardian.preferredLanguage)
      ?? templates.find((x) => x.channel === channel && x.language === settings.defaultLanguage)
      ?? templates.find((x) => x.channel === channel);
    if (!t) continue;
    const res = await tx.insert(notificationOutbox).values({
      idempotencyKey: `${a.keyBase}:${channel}`,
      event: a.event,
      channel,
      recipient,
      guardianId: guardian.id,
      studentIds: a.studentIds,
      invoiceIds: a.invoiceIds ?? [],
      subject: t.subject ? renderTemplate(t.subject, vars) : null,
      body: renderTemplate(t.body, vars),
      providerTemplateId: t.providerTemplateId,
      // Positional values {{1}}, {{2}}… for WhatsApp/DLT templates, in the order the placeholders appear.
      templateParams: Object.fromEntries([...t.body.matchAll(/\{(\w+)\}/g)].map((m, i) => [String(i + 1), String((vars as Record<string, string>)[m[1]!] ?? "")])),
      attachmentPath: channel === "sms" ? null : a.attachmentPath ?? null,
      expiresAt: a.expiresAt ?? null,
    }).onConflictDoNothing({ target: notificationOutbox.idempotencyKey }).returning({ id: notificationOutbox.id });
    count += res.length;
  }
  return count;
}

/** Common per-student variables. */
export async function studentVars(tx: Executor, studentId: number): Promise<Record<string, string>> {
  const [s] = await tx.select({ name: students.name, cls: classes.name }).from(students)
    .innerJoin(classes, eq(classes.id, students.classId)).where(eq(students.id, studentId));
  return { student_name: s?.name ?? "", class: s?.cls ?? "" };
}

// ---------------------------------------------------------------- reminder triggers
export interface ReminderPlan { event: NotifyEvent; step: number; expires: ISODate }

/**
 * Which reminder (if any) an unpaid bill should get on `onDate`. Pure; unit tested.
 * Each reminder has a window rather than one exact day, so a morning when the
 * school PC was switched off doesn't lose it. The idempotency key (event + step)
 * still guarantees each reminder is sent at most once.
 *  - due soon:  any day in the `daysBefore` days before the due date
 *  - due today: the due date itself
 *  - overdue:   the latest step reached (e.g. 3, 7, 15 days late), until the next step;
 *               the last step stays open for 3 days
 */
export function reminderFor(dueDate: ISODate, onDate: ISODate, daysBefore: number, overdueSteps: readonly number[]): ReminderPlan | null {
  const d = daysBetween(dueDate, onDate); // >0 = days late, <0 = days early
  if (d < 0) return daysBefore > 0 && -d <= daysBefore ? { event: "DUE_UPCOMING", step: 0, expires: addDays(dueDate, -1) } : null;
  if (d === 0) return { event: "DUE_TODAY", step: 0, expires: onDate };
  const steps = [...new Set(overdueSteps)].filter((n) => n > 0).sort((a, b) => a - b);
  let i = -1;
  for (let k = 0; k < steps.length; k++) if (steps[k]! <= d) i = k;
  if (i < 0) return null;
  const step = steps[i]!;
  const next = steps[i + 1];
  const windowEnd = next !== undefined ? next - 1 : step + 2;
  if (d > windowEnd) return null;
  return { event: "OVERDUE", step, expires: addDays(dueDate, windowEnd) };
}

/**
 * Daily scan: queue "due soon", "due today" and overdue reminders.
 * Siblings with the same primary guardian get ONE combined message per reminder.
 */
export async function queueDueReminders(onDate: ISODate = today()): Promise<number> {
  const db = getDb();
  const settings = await getSettings(db);
  const rows = await db.select({
    invoiceId: invoices.id, invoiceNo: invoices.invoiceNo, balance: invoices.balance, dueDate: invoices.dueDate,
    studentId: students.id, studentName: students.name, cls: classes.name, guardianId: studentGuardians.guardianId,
  }).from(invoices)
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(classes, eq(classes.id, students.classId))
    .innerJoin(studentGuardians, and(eq(studentGuardians.studentId, students.id), eq(studentGuardians.isPrimary, true)))
    .where(and(lte(invoices.dueDate, addDays(onDate, settings.reminderDaysBefore)), gt(invoices.balance, 0),
      ne(invoices.status, "cancelled"), eq(students.status, "active")));

  // Group: one message per guardian per (reminder, due date, step).
  type Row = (typeof rows)[number];
  const groups = new Map<string, { plan: ReminderPlan; guardianId: number; dueDate: ISODate; list: Row[] }>();
  for (const r of rows) {
    const plan = reminderFor(r.dueDate, onDate, settings.reminderDaysBefore, settings.overdueSteps);
    if (!plan) continue;
    const key = `${plan.event}:g${r.guardianId}:${r.dueDate}:${plan.step}`;
    const g = groups.get(key) ?? { plan, guardianId: r.guardianId, dueDate: r.dueDate, list: [] };
    g.list.push(r);
    groups.set(key, g);
  }

  let queued = 0;
  for (const [keyBase, { plan, dueDate, list }] of groups) {
    const total = list.reduce((a, r) => a + r.balance, 0);
    queued += await db.transaction((tx) => enqueue(tx, {
      event: plan.event,
      keyBase,
      studentIds: [...new Set(list.map((r) => r.studentId))],
      invoiceIds: list.map((r) => r.invoiceId),
      vars: {
        student_name: [...new Set(list.map((r) => r.studentName))].join(", "),
        class: [...new Set(list.map((r) => r.cls))].join(", "),
        amount_due: formatINR(total, { symbol: false }),
        due_date: formatDate(dueDate),
        invoice_no: list.map((r) => r.invoiceNo).join(", "),
        dues_detail: list.map((r) => `${r.studentName} (${r.cls}): ${formatINR(r.balance)} – ${r.invoiceNo}`).join("\n"),
      },
      expiresAt: new Date(`${plan.expires}T23:59:59`),
    }));
  }
  return queued;
}

/** Why a guardian can or can't be reached on each channel (for the manual buttons). */
export type ChannelAvailability = Record<Channel, { ok: boolean; to?: string; reason?: string }>;
export function channelAvailability(g: { messagingConsent: boolean; mobile: string; whatsappNo: string | null; email: string | null; notifySms: boolean; notifyWhatsapp: boolean; notifyEmail: boolean } | null | undefined): ChannelAvailability {
  const no = (reason: string) => ({ ok: false, reason });
  if (!g) return { whatsapp: no("No guardian"), email: no("No guardian"), sms: no("No guardian") };
  if (!g.messagingConsent) { const r = no("Parent hasn't consented to messages (edit student)"); return { whatsapp: r, email: r, sms: r }; }
  return {
    whatsapp: g.notifyWhatsapp ? { ok: true, to: g.whatsappNo ?? g.mobile } : no("WhatsApp turned off for this parent"),
    email: !g.email ? no("No email address on file") : g.notifyEmail ? { ok: true, to: g.email } : no("Email turned off for this parent"),
    sms: g.notifySms ? { ok: true, to: g.mobile } : no("SMS turned off for this parent"),
  };
}

/**
 * Manual reminder ("Send reminder now", or the WhatsApp / Email / SMS buttons).
 * One combined message per guardian covering all their children's unpaid bills.
 * Keyed to the minute, so a double-click doesn't send twice but staff can resend later.
 */
export async function sendReminderNow(actor: Actor, studentIds: number[], channels: Channel[] = CHANNELS): Promise<number> {
  const db = getDb();
  if (!studentIds.length) return 0;
  const rows = await db.select({
    invoiceId: invoices.id, invoiceNo: invoices.invoiceNo, balance: invoices.balance, dueDate: invoices.dueDate,
    studentId: students.id, studentName: students.name, cls: classes.name, guardianId: studentGuardians.guardianId,
  }).from(invoices)
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(classes, eq(classes.id, students.classId))
    .innerJoin(studentGuardians, and(eq(studentGuardians.studentId, students.id), eq(studentGuardians.isPrimary, true)))
    .where(and(inArray(students.id, studentIds), gt(invoices.balance, 0), ne(invoices.status, "cancelled")));
  const byGuardian = new Map<number, typeof rows>();
  for (const r of rows) byGuardian.set(r.guardianId, [...(byGuardian.get(r.guardianId) ?? []), r]);
  let n = 0;
  const d = today();
  const minute = new Date().toISOString().slice(0, 16);
  for (const [guardianId, list] of byGuardian) {
    const oldest = list.map((r) => r.dueDate).sort()[0]!;
    n += await db.transaction(async (tx) => {
      const c = await enqueue(tx, {
        event: oldest < d ? "OVERDUE" : "DUE_UPCOMING",
        keyBase: `MANUAL:g${guardianId}:${minute}`,
        channels,
        studentIds: [...new Set(list.map((r) => r.studentId))],
        invoiceIds: list.map((r) => r.invoiceId),
        vars: {
          student_name: [...new Set(list.map((r) => r.studentName))].join(", "),
          class: [...new Set(list.map((r) => r.cls))].join(", "),
          amount_due: formatINR(list.reduce((a, r) => a + r.balance, 0), { symbol: false }),
          due_date: formatDate(oldest),
          invoice_no: list.map((r) => r.invoiceNo).join(", "),
          dues_detail: list.map((r) => `${r.studentName} (${r.cls}): ${formatINR(r.balance)} – ${r.invoiceNo}`).join("\n"),
        },
        expiresAt: new Date(`${addDays(d, 1)}T23:59:59`),
      });
      if (c) await audit(tx, actor, "send_reminder", "guardian", guardianId, null, { channels, studentIds });
      return c;
    });
  }
  return n;
}

// ---------------------------------------------------------------- dispatcher
const BACKOFF_MS = [2, 10, 60, 360, 1440].map((m) => m * 60_000);
const MAX_ATTEMPTS = BACKOFF_MS.length;
const PER_CHANNEL_PER_RUN = 40;

function withinWindow(now: Date, start: string, end: string): boolean {
  const hm = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const a = toMin(start), b = toMin(end);
  return a <= b ? hm >= a && hm < b : hm >= a || hm < b;
}

export interface DispatchResult { picked: number; sent: number; failed: number; cancelled: number; skippedReason?: string }

/**
 * Sends queued messages. Safe to run concurrently (SKIP LOCKED) and repeatedly.
 * `isOnline` is injected so tests and the offline case are explicit.
 */
export async function dispatchOutbox(opts: {
  adapters: Partial<Record<Channel, NotificationAdapter>>;
  isOnline: () => Promise<boolean>;
  now?: Date;
  ignoreQuietHours?: boolean;
}): Promise<DispatchResult> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const settings = await getSettings(db);
  const result: DispatchResult = { picked: 0, sent: 0, failed: 0, cancelled: 0 };

  // Recover rows stuck in "sending" (e.g. the PC lost power mid-send).
  await db.update(notificationOutbox).set({ status: "queued" })
    .where(and(eq(notificationOutbox.status, "sending"), lte(notificationOutbox.nextAttemptAt, new Date(now.getTime() - 10 * 60_000))));

  // Expire stale messages regardless of connectivity.
  const expired = await db.update(notificationOutbox).set({ status: "cancelled", lastError: "Expired before it could be sent" })
    .where(and(eq(notificationOutbox.status, "queued"), lte(notificationOutbox.expiresAt, now))).returning({ id: notificationOutbox.id });
  result.cancelled += expired.length;

  if (!opts.ignoreQuietHours && !withinWindow(now, settings.quietStart, settings.quietEnd)) return { ...result, skippedReason: "outside sending hours" };
  if (!(await opts.isOnline())) return { ...result, skippedReason: "offline" };

  const batch: OutboxRow[] = [];
  for (const channel of CHANNELS) {
    if (!opts.adapters[channel]) continue;
    const rows = await db.transaction(async (tx) => {
      const picked = await tx.select().from(notificationOutbox)
        .where(and(eq(notificationOutbox.status, "queued"), eq(notificationOutbox.channel, channel), lte(notificationOutbox.nextAttemptAt, now)))
        .orderBy(notificationOutbox.id).limit(PER_CHANNEL_PER_RUN).for("update", { skipLocked: true });
      if (picked.length) {
        await tx.update(notificationOutbox).set({ status: "sending", nextAttemptAt: now })
          .where(inArray(notificationOutbox.id, picked.map((p) => p.id)));
      }
      return picked;
    });
    batch.push(...rows);
  }
  result.picked = batch.length;

  for (const m of batch) {
    // Paid while waiting? Don't ask a parent who has already paid.
    if (REMINDER_EVENTS.includes(m.event) && m.invoiceIds.length) {
      const [{ open } = { open: 0 }] = await db.select({ open: sql<number>`count(*)::int` }).from(invoices)
        .where(and(inArray(invoices.id, m.invoiceIds), gt(invoices.balance, 0), ne(invoices.status, "cancelled")));
      if (open === 0) {
        await db.update(notificationOutbox).set({ status: "cancelled", lastError: "Dues already paid" }).where(eq(notificationOutbox.id, m.id));
        result.cancelled++;
        continue;
      }
    }
    const adapter = opts.adapters[m.channel]!;
    let res: SendResult;
    try {
      res = await adapter.send({
        id: m.id, channel: m.channel, recipient: m.recipient, subject: m.subject, body: m.body,
        providerTemplateId: m.providerTemplateId, templateParams: m.templateParams, attachmentPath: m.attachmentPath,
      });
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (res.ok) {
      await db.update(notificationOutbox).set({ status: "sent", sentAt: new Date(), providerMsgId: res.providerMsgId ?? null, lastError: null, attempts: m.attempts + 1 })
        .where(eq(notificationOutbox.id, m.id));
      result.sent++;
    } else {
      const attempts = m.attempts + 1;
      const giveUp = res.permanent || attempts >= MAX_ATTEMPTS;
      await db.update(notificationOutbox).set({
        status: giveUp ? "failed" : "queued",
        attempts,
        lastError: res.error.slice(0, 1000),
        nextAttemptAt: new Date(now.getTime() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS.at(-1)!)),
      }).where(eq(notificationOutbox.id, m.id));
      if (giveUp) result.failed++;
    }
  }
  return result;
}

export async function retryMessage(actor: Actor, id: number) {
  const db = getDb();
  await db.update(notificationOutbox).set({ status: "queued", nextAttemptAt: new Date(), attempts: 0, lastError: null })
    .where(and(eq(notificationOutbox.id, id), inArray(notificationOutbox.status, ["failed", "cancelled"])));
  await audit(db, actor, "retry", "notification_outbox", id);
}
export async function cancelMessage(actor: Actor, id: number) {
  const db = getDb();
  await db.update(notificationOutbox).set({ status: "cancelled", lastError: "Cancelled by user" })
    .where(and(eq(notificationOutbox.id, id), eq(notificationOutbox.status, "queued")));
  await audit(db, actor, "cancel", "notification_outbox", id);
}

export async function outboxStats() {
  const rows = await getDb().select({ status: notificationOutbox.status, n: sql<number>`count(*)::int` })
    .from(notificationOutbox).groupBy(notificationOutbox.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<OutboxRow["status"], number>>;
}

export { SYSTEM };

// ---------------------------------------------------------------- admin screens
export async function listOutbox(f: { status?: OutboxRow["status"]; channel?: Channel; limit?: number }) {
  const conds = [];
  if (f.status) conds.push(eq(notificationOutbox.status, f.status));
  if (f.channel) conds.push(eq(notificationOutbox.channel, f.channel));
  return getDb().select().from(notificationOutbox).where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(notificationOutbox.id)).limit(f.limit ?? 300);
}

export async function listTemplates() {
  return getDb().select().from(notificationTemplates).orderBy(notificationTemplates.event, notificationTemplates.channel, notificationTemplates.language);
}

export async function saveTemplate(actor: Actor, input: unknown) {
  const { templateSchema } = await import("@sb/validation");
  const d = templateSchema.parse(input);
  const db = getDb();
  const [old] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.id, d.id));
  await db.update(notificationTemplates).set({ subject: d.subject || null, body: d.body, providerTemplateId: d.providerTemplateId || null, isActive: d.isActive })
    .where(eq(notificationTemplates.id, d.id));
  await audit(db, actor, "update", "notification_template", d.id, old ?? null, d);
}

/** Copy a template into another language (e.g. Hindi) for editing. */
export async function addTemplateLanguage(actor: Actor, templateId: number, language: string) {
  const db = getDb();
  const [t] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.id, templateId));
  if (!t) return;
  await db.insert(notificationTemplates).values({ event: t.event, channel: t.channel, language, subject: t.subject, body: t.body }).onConflictDoNothing();
  await audit(db, actor, "create", "notification_template", null, null, { from: templateId, language });
}

export const SAMPLE_VARS: Record<string, string> = {
  guardian_name: "Ramesh Kumar", student_name: "Anita Kumar", class: "V", amount_due: "2,200.00", due_date: "10 Jul 2026",
  invoice_no: "INV/2026-27/000123", school_name: "Demo Public School", school_phone: "9876543210",
  dues_detail: "Anita Kumar (V): ₹ 2,200.00 – INV/2026-27/000123", amount_paid: "2,200.00", receipt_no: "RCT/2026-27/000045",
  balance: "0.00", cheque_no: "123456", bounce_charge: "300.00", late_fee: "50.00",
};

/** Channel availability for many students at once (primary guardian of each). */
export async function availabilityForStudents(studentIds: number[]): Promise<Map<number, ChannelAvailability>> {
  const out = new Map<number, ChannelAvailability>();
  if (!studentIds.length) return out;
  const rows = await getDb().select({ sid: studentGuardians.studentId, g: guardians }).from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(inArray(studentGuardians.studentId, studentIds)).orderBy(desc(studentGuardians.isPrimary));
  for (const r of rows) if (!out.has(r.sid)) out.set(r.sid, channelAvailability(r.g));
  for (const id of studentIds) if (!out.has(id)) out.set(id, channelAvailability(null));
  return out;
}
