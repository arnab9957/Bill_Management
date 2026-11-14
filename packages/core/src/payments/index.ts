import { and, asc, desc, eq, isNull, sql, gte, lte } from "drizzle-orm";
import {
  getDb, cheques, classes, dayCloses, feeHeads, invoiceLines, invoices, paymentAllocations, payments, refunds, sections,
  studentWallets, students, users, type Executor,
} from "@sb/db";
import {
  cancelReceiptSchema, chequeBounceSchema, collectPaymentSchema, dayCloseSchema, refundSchema, type CollectPaymentInput,
} from "@sb/validation";
import { AppError, audit, formatDocNo, getSettings, nextNumber, yearForDate, type Actor } from "../common";
import { formatDate, today, type ISODate } from "../dates";
import { formatINR } from "../money";
import { enqueue, studentVars } from "../notifications";
import { allocateOldestFirst, validateManualAllocation } from "../billing/rules";
import { recalcInvoice } from "../billing";
import { openLines, recalcWallet } from "./wallet";

export { openLines, recalcWallet, applyWalletToInvoice } from "./wallet";

async function assertDayOpen(tx: Executor, actor: Actor, date: ISODate) {
  if (actor.id == null) return;
  if (!(await getSettings(tx)).dayCloseEnabled) return; // counter closing is optional and off by default
  const closed = await tx.select({ id: dayCloses.id }).from(dayCloses).where(and(eq(dayCloses.date, date), eq(dayCloses.userId, actor.id)));
  if (closed.length) throw new AppError(`Your counter is already closed for ${formatDate(date)}. Ask an accountant to record this entry.`);
}

async function lockStudent(tx: Executor, studentId: number) {
  const [s] = await tx.select().from(students).where(eq(students.id, studentId)).for("update");
  if (!s) throw new AppError("Student not found");
  return s;
}

/**
 * The counter operation. One transaction; the student row lock serialises two
 * counters collecting for the same student so dues can never be double-allocated.
 */
export async function collectPayment(input: CollectPaymentInput, actor: Actor) {
  const d = collectPaymentSchema.parse(input);
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    await lockStudent(tx, d.studentId);
    await assertDayOpen(tx, actor, d.date);
    const lines = await openLines(tx, d.studentId);
    let plan;
    try {
      plan = d.allocations?.length ? validateManualAllocation(lines, d.allocations, d.amount) : allocateOldestFirst(lines, d.amount);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : "Invalid allocation");
    }
    const year = await yearForDate(tx, d.date);
    const settings = await getSettings(tx);
    const receiptNo = formatDocNo(settings.receiptPrefix, year.name, await nextNumber(tx, `RECEIPT:${year.name}`));
    const [p] = await tx.insert(payments).values({
      receiptNo, studentId: d.studentId, date: d.date, academicYearId: year.id, amount: d.amount, unallocated: plan.remainder, mode: d.mode,
      referenceNo: d.referenceNo || d.chequeNo || null, bank: d.bank || null, receivedBy: actor.id!,
    }).returning();
    if ((d.mode === "cheque" || d.mode === "dd") && d.chequeNo && d.bank) {
      await tx.insert(cheques).values({ paymentId: p!.id, chequeNo: d.chequeNo, bank: d.bank, chequeDate: d.chequeDate ?? d.date });
    }
    for (const a of plan.allocations) {
      await tx.insert(paymentAllocations).values({ paymentId: p!.id, invoiceId: a.invoiceId, invoiceLineId: a.invoiceLineId, amount: a.amount });
      await tx.update(invoiceLines).set({ paid: sql`${invoiceLines.paid} + ${a.amount}` }).where(eq(invoiceLines.id, a.invoiceLineId));
    }
    for (const invId of new Set(plan.allocations.map((a) => a.invoiceId))) await recalcInvoice(tx, invId);
    const wallet = await recalcWallet(tx, d.studentId);
    const outstanding = await studentOutstanding(tx, d.studentId);
    await audit(tx, actor, "create", "payment", p!.id, null, { receiptNo, amount: d.amount, mode: d.mode, allocations: plan.allocations, toWallet: plan.remainder });
    await enqueue(tx, {
      event: "PAYMENT_RECEIVED", keyBase: `PAYMENT_RECEIVED:pay:${p!.id}`, studentIds: [d.studentId],
      vars: { ...(await studentVars(tx, d.studentId)), amount_paid: formatINR(d.amount, { symbol: false }), receipt_no: receiptNo, balance: formatINR(outstanding, { symbol: false }) },
    });
    return { paymentId: p!.id, receiptNo, allocations: plan.allocations, toWallet: plan.remainder, wallet, outstanding };
  });
  return result;
}

export async function studentOutstanding(tx: Executor, studentId: number): Promise<number> {
  const [r] = await tx.select({ v: sql<string>`coalesce(sum(${invoices.balance}),0)` }).from(invoices)
    .where(and(eq(invoices.studentId, studentId), sql`${invoices.status} <> 'cancelled'`));
  return Number(r?.v ?? 0);
}

/** Reverse a payment's allocations and mark it cancelled. Used by cancellation and cheque bounce. */
async function reversePayment(tx: Executor, actor: Actor, paymentId: number, reason: string) {
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
  if (!p) throw new AppError("Receipt not found");
  if (p.status === "cancelled") throw new AppError("Receipt is already cancelled");
  await lockStudent(tx, p.studentId);
  const allocs = await tx.select().from(paymentAllocations).where(and(eq(paymentAllocations.paymentId, p.id), isNull(paymentAllocations.reversedAt)));
  for (const a of allocs) {
    await tx.update(invoiceLines).set({ paid: sql`${invoiceLines.paid} - ${a.amount}` }).where(eq(invoiceLines.id, a.invoiceLineId));
    await tx.update(paymentAllocations).set({ reversedAt: new Date() }).where(eq(paymentAllocations.id, a.id));
  }
  for (const invId of new Set(allocs.map((a) => a.invoiceId))) await recalcInvoice(tx, invId);
  await tx.update(payments).set({ status: "cancelled", cancelReason: reason, cancelledBy: actor.id, unallocated: 0 }).where(eq(payments.id, p.id));
  await recalcWallet(tx, p.studentId);
  await audit(tx, actor, "cancel", "payment", p.id, { status: "valid", amount: p.amount }, { status: "cancelled", reason, reversed: allocs.length });
  return p;
}

export async function cancelReceipt(actor: Actor, input: unknown) {
  const d = cancelReceiptSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, d.paymentId));
    if (!p) throw new AppError("Receipt not found");
    if (actor.role !== "ADMIN" && (await getSettings(tx)).dayCloseEnabled) {
      const closed = await tx.select({ id: dayCloses.id }).from(dayCloses).where(and(eq(dayCloses.date, p.date), eq(dayCloses.userId, p.receivedBy)));
      if (closed.length) throw new AppError("That day has been closed. Only an Admin can cancel this receipt.");
    }
    return reversePayment(tx, actor, d.paymentId, d.reason);
  });
}

export async function chequeBounced(actor: Actor, input: unknown) {
  const d = chequeBounceSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [c] = await tx.select().from(cheques).where(eq(cheques.id, d.chequeId)).for("update");
    if (!c) throw new AppError("Cheque not found");
    if (c.status !== "pending") throw new AppError(`Cheque is already ${c.status}`);
    const p = await reversePayment(tx, actor, c.paymentId, `Cheque ${c.chequeNo} bounced`);
    await tx.update(cheques).set({ status: "bounced", bounceCharge: d.bounceCharge, updatedAt: new Date() }).where(eq(cheques.id, c.id));
    if (d.bounceCharge > 0) {
      const year = await yearForDate(tx, today());
      const s = await getSettings(tx);
      const [head] = await tx.select().from(feeHeads).where(eq(feeHeads.code, "BOUNCE"));
      const invoiceNo = formatDocNo(s.invoicePrefix, year.name, await nextNumber(tx, `INVOICE:${year.name}`));
      const [inv] = await tx.insert(invoices).values({
        invoiceNo, studentId: p.studentId, academicYearId: year.id, period: `CHQ-${c.id}`, issueDate: today(), dueDate: today(), createdBy: actor.id,
      }).returning();
      await tx.insert(invoiceLines).values({ invoiceId: inv!.id, feeHeadId: head?.id ?? null, kind: "bounce_charge", description: `Cheque ${c.chequeNo} bounce charge`, amount: d.bounceCharge, net: d.bounceCharge });
      await recalcInvoice(tx, inv!.id);
    }
    await audit(tx, actor, "bounce", "cheque", c.id, { status: "pending" }, { status: "bounced", charge: d.bounceCharge });
    await enqueue(tx, {
      event: "CHEQUE_BOUNCED", keyBase: `CHEQUE_BOUNCED:chq:${c.id}`, studentIds: [p.studentId],
      vars: { ...(await studentVars(tx, p.studentId)), cheque_no: c.chequeNo, bounce_charge: formatINR(d.bounceCharge, { symbol: false }) },
    });
  });
}

export async function chequeCleared(actor: Actor, chequeId: number) {
  const db = getDb();
  const [c] = await db.update(cheques).set({ status: "cleared", updatedAt: new Date() })
    .where(and(eq(cheques.id, chequeId), eq(cheques.status, "pending"))).returning();
  if (!c) throw new AppError("Cheque not found or not pending");
  await audit(db, actor, "clear", "cheque", chequeId);
}

export async function listCheques(status?: "pending" | "cleared" | "bounced") {
  return getDb().select({ c: cheques, receiptNo: payments.receiptNo, amount: payments.amount, studentName: students.name, admissionNo: students.admissionNo, date: payments.date })
    .from(cheques).innerJoin(payments, eq(payments.id, cheques.paymentId)).innerJoin(students, eq(students.id, payments.studentId))
    .where(status ? eq(cheques.status, status) : undefined).orderBy(desc(cheques.id)).limit(300);
}

/** Pay out advance (wallet) money, e.g. on leaving school. */
export async function refund(actor: Actor, input: unknown) {
  const d = refundSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await lockStudent(tx, d.studentId);
    const credits = await tx.select().from(payments)
      .where(and(eq(payments.studentId, d.studentId), eq(payments.status, "valid"), sql`${payments.unallocated} > 0`))
      .orderBy(asc(payments.id)).for("update");
    const available = credits.reduce((a, p) => a + p.unallocated, 0);
    if (d.amount > available) throw new AppError(`Only ${formatINR(available)} is available in advance balance`);
    let left = d.amount;
    for (const p of credits) {
      if (left <= 0) break;
      const take = Math.min(left, p.unallocated);
      await tx.update(payments).set({ unallocated: p.unallocated - take }).where(eq(payments.id, p.id));
      left -= take;
    }
    const [r] = await tx.insert(refunds).values({ studentId: d.studentId, amount: d.amount, mode: d.mode, reason: d.reason, approvedBy: actor.id! }).returning();
    await recalcWallet(tx, d.studentId);
    await audit(tx, actor, "create", "refund", r!.id, null, d);
    return r!;
  });
}

// ---------------------------------------------------------------- day book & closing
export async function dayBook(date: ISODate, userId?: number) {
  const db = getDb();
  const conds = [eq(payments.date, date)];
  if (userId) conds.push(eq(payments.receivedBy, userId));
  const rows = await db.select({ p: payments, studentName: students.name, admissionNo: students.admissionNo, cashier: users.fullName })
    .from(payments).innerJoin(students, eq(students.id, payments.studentId)).innerJoin(users, eq(users.id, payments.receivedBy))
    .where(and(...conds)).orderBy(asc(payments.id));
  const valid = rows.filter((r) => r.p.status === "valid");
  const byMode: Record<string, number> = {};
  for (const r of valid) byMode[r.p.mode] = (byMode[r.p.mode] ?? 0) + r.p.amount;
  const closes = await db.select({ c: dayCloses, name: users.fullName }).from(dayCloses).innerJoin(users, eq(users.id, dayCloses.userId)).where(eq(dayCloses.date, date));
  return { rows, total: valid.reduce((a, r) => a + r.p.amount, 0), byMode, cancelled: rows.length - valid.length, closes };
}

export async function closeDay(actor: Actor, input: unknown) {
  const d = dayCloseSchema.parse(input);
  return getDb().transaction(async (tx) => {
    if (!(await getSettings(tx)).dayCloseEnabled) throw new AppError("Counter closing is turned off. An Admin can turn it on in Settings.");
    const exists = await tx.select().from(dayCloses).where(and(eq(dayCloses.date, d.date), eq(dayCloses.userId, actor.id!)));
    if (exists.length) throw new AppError("This day is already closed for your counter");
    const rows = await tx.select({ mode: payments.mode, total: sql<string>`sum(${payments.amount})` }).from(payments)
      .where(and(eq(payments.date, d.date), eq(payments.receivedBy, actor.id!), eq(payments.status, "valid"))).groupBy(payments.mode);
    const systemTotal = rows.reduce((a, r) => a + Number(r.total), 0);
    const systemCash = Number(rows.find((r) => r.mode === "cash")?.total ?? 0);
    const countedCash = Object.entries(d.counts).reduce((a, [den, n]) => a + Number(den) * 100 * n, 0);
    const [row] = await tx.insert(dayCloses).values({
      date: d.date, userId: actor.id!, systemTotal, systemCash, countedCash, denominations: d.counts, difference: countedCash - systemCash,
    }).returning();
    await audit(tx, actor, "close_day", "day_close", row!.id, null, { date: d.date, systemCash, countedCash });
    return row!;
  });
}

// ---------------------------------------------------------------- queries
export async function getReceipt(paymentId: number) {
  const db = getDb();
  const [row] = await db.select({ p: payments, student: students, className: classes.name, sectionName: sections.name, cashier: users.fullName })
    .from(payments).innerJoin(students, eq(students.id, payments.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .leftJoin(sections, eq(sections.id, students.sectionId)).innerJoin(users, eq(users.id, payments.receivedBy))
    .where(eq(payments.id, paymentId));
  if (!row) return null;
  const lines = await db.select({ amount: paymentAllocations.amount, description: invoiceLines.description, invoiceNo: invoices.invoiceNo, reversedAt: paymentAllocations.reversedAt })
    .from(paymentAllocations).innerJoin(invoiceLines, eq(invoiceLines.id, paymentAllocations.invoiceLineId)).innerJoin(invoices, eq(invoices.id, paymentAllocations.invoiceId))
    .where(eq(paymentAllocations.paymentId, paymentId)).orderBy(asc(paymentAllocations.id));
  const [cheque] = await db.select().from(cheques).where(eq(cheques.paymentId, paymentId));
  const outstanding = await studentOutstanding(db, row.p.studentId);
  return { ...row, lines, cheque, outstanding };
}

/** Increment print count; returns true when this print is a duplicate. */
export async function markPrinted(paymentId: number): Promise<boolean> {
  const [r] = await getDb().update(payments).set({ printCount: sql`${payments.printCount} + 1` }).where(eq(payments.id, paymentId)).returning({ n: payments.printCount });
  return (r?.n ?? 1) > 1;
}

/** Everything the counter screen needs for one student. */
export async function counterView(studentId: number) {
  const db = getDb();
  const lines = await openLines(db, studentId);
  const [w] = await db.select().from(studentWallets).where(eq(studentWallets.studentId, studentId));
  const recent = await db.select().from(payments).where(eq(payments.studentId, studentId)).orderBy(desc(payments.id)).limit(5);
  const total = lines.reduce((a, l) => a + l.balance, 0);
  return { lines, wallet: w?.balance ?? 0, recent, total };
}

export async function listPayments(f: { from?: ISODate; to?: ISODate; mode?: string; userId?: number; status?: "valid" | "cancelled" }) {
  const conds = [];
  if (f.from) conds.push(gte(payments.date, f.from));
  if (f.to) conds.push(lte(payments.date, f.to));
  if (f.mode) conds.push(eq(payments.mode, f.mode as never));
  if (f.userId) conds.push(eq(payments.receivedBy, f.userId));
  if (f.status) conds.push(eq(payments.status, f.status));
  return getDb().select({ p: payments, studentName: students.name, admissionNo: students.admissionNo, className: classes.name, cashier: users.fullName })
    .from(payments).innerJoin(students, eq(students.id, payments.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .innerJoin(users, eq(users.id, payments.receivedBy))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(payments.id)).limit(1000);
}

