import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { invoiceLines, invoices, paymentAllocations, payments, studentWallets, type Executor } from "@sb/db";

/** Wallet = sum of unallocated parts of valid payments. Cached in student_wallet. */
export async function recalcWallet(tx: Executor, studentId: number): Promise<number> {
  const [r] = await tx.select({ v: sql<string>`coalesce(sum(${payments.unallocated}),0)` }).from(payments)
    .where(and(eq(payments.studentId, studentId), eq(payments.status, "valid")));
  const balance = Number(r?.v ?? 0);
  await tx.insert(studentWallets).values({ studentId, balance })
    .onConflictDoUpdate({ target: studentWallets.studentId, set: { balance } });
  return balance;
}

/**
 * Spend advance money (unallocated payment amounts, oldest first) on an invoice's open lines.
 * Caller holds the student lock and recalculates the invoice afterwards.
 */
export async function applyWalletToInvoice(tx: Executor, studentId: number, invoiceId: number): Promise<number> {
  const credits = await tx.select().from(payments)
    .where(and(eq(payments.studentId, studentId), eq(payments.status, "valid"), gt(payments.unallocated, 0)))
    .orderBy(asc(payments.id)).for("update");
  if (!credits.length) return 0;
  const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.id));
  let used = 0;
  for (const line of lines) {
    let room = line.net - line.paid;
    for (const p of credits) {
      if (room <= 0) break;
      if (p.unallocated <= 0) continue;
      const take = Math.min(room, p.unallocated);
      await tx.insert(paymentAllocations).values({ paymentId: p.id, invoiceId, invoiceLineId: line.id, amount: take });
      p.unallocated -= take;
      room -= take;
      used += take;
      await tx.update(invoiceLines).set({ paid: sql`${invoiceLines.paid} + ${take}` }).where(eq(invoiceLines.id, line.id));
    }
  }
  for (const p of credits) await tx.update(payments).set({ unallocated: p.unallocated }).where(eq(payments.id, p.id));
  if (used) await recalcWallet(tx, studentId);
  return used;
}

/** Open (payable) lines for a student, oldest invoice first. */
export async function openLines(tx: Executor, studentId: number) {
  return tx.select({
    invoiceId: invoices.id, invoiceNo: invoices.invoiceNo, period: invoices.period, dueDate: invoices.dueDate,
    invoiceLineId: invoiceLines.id, description: invoiceLines.description, net: invoiceLines.net, paid: invoiceLines.paid,
    balance: sql<number>`(${invoiceLines.net} - ${invoiceLines.paid})::bigint`.mapWith(Number),
  }).from(invoiceLines).innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoices.studentId, studentId), inArray(invoices.status, ["issued", "partial", "overdue"]), sql`${invoiceLines.net} > ${invoiceLines.paid}`))
    .orderBy(asc(invoices.dueDate), asc(invoices.id), asc(invoiceLines.id));
}
