import ExcelJS from "exceljs";
import { and, asc, desc, eq, gte, lte, ne, sql, gt } from "drizzle-orm";
import {
  getDb, classes, feeHeads, invoiceLines, invoices, notificationOutbox, paymentAllocations, payments, students, users,
  studentGuardians, guardians, auditLog, refunds, studentEnrollments,
} from "@sb/db";
import { today, addDays, periodOf, type ISODate } from "../dates";

const num = (v: unknown) => Number(v ?? 0);

export interface DashboardRange { yearId: number; yearStart: ISODate; yearEnd: ISODate; from: ISODate; to: ISODate; onDate?: ISODate }

/**
 * Dashboard for one academic session and a date range inside it (today, a month, the whole session…).
 * Period figures use `from`..`to`; session figures cover the whole academic year.
 */
export async function dashboard(r: DashboardRange) {
  const db = getDb();
  const onDate = r.onDate ?? today();
  const paid = and(eq(payments.status, "valid"), eq(payments.academicYearId, r.yearId));
  const inRange = and(paid, gte(payments.date, r.from), lte(payments.date, r.to));
  const live = and(eq(invoices.academicYearId, r.yearId), ne(invoices.status, "cancelled"));

  const [[col], [billed], byMode, daily, recent, [session], [sessionPaid], topClasses, monthlyPaid, monthlyBilled, [failed], [queued]] = await Promise.all([
    db.select({ v: sql`coalesce(sum(${payments.amount}),0)`, n: sql`count(*)` }).from(payments).where(inRange),
    db.select({ v: sql`coalesce(sum(${invoices.net}),0)`, n: sql`count(*)` }).from(invoices).where(and(live, gte(invoices.issueDate, r.from), lte(invoices.issueDate, r.to))),
    db.select({ mode: payments.mode, v: sql`sum(${payments.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) }).from(payments).where(inRange).groupBy(payments.mode).orderBy(desc(sql`sum(${payments.amount})`)),
    db.select({ day: sql<string>`${payments.date}::text`, v: sql`sum(${payments.amount})`.mapWith(Number) }).from(payments).where(inRange).groupBy(payments.date).orderBy(asc(payments.date)),
    db.select({ id: payments.id, receiptNo: payments.receiptNo, date: payments.date, amount: payments.amount, mode: payments.mode, studentId: students.id, studentName: students.name })
      .from(payments).innerJoin(students, eq(students.id, payments.studentId)).where(inRange).orderBy(desc(payments.id)).limit(8),
    db.select({ billed: sql`coalesce(sum(${invoices.net}),0)`, balance: sql`coalesce(sum(${invoices.balance}),0)`,
      overdue: sql`coalesce(sum(case when ${invoices.dueDate} < ${onDate} then ${invoices.balance} end),0)` }).from(invoices).where(live),
    db.select({ v: sql`coalesce(sum(${payments.amount}),0)` }).from(payments).where(paid),
    db.select({ className: classes.name, v: sql`sum(${invoices.balance})`.mapWith(Number), students: sql`count(distinct ${invoices.studentId})`.mapWith(Number) })
      .from(invoices)
      .innerJoin(studentEnrollments, and(eq(studentEnrollments.studentId, invoices.studentId), eq(studentEnrollments.academicYearId, r.yearId)))
      .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
      .where(and(live, gt(invoices.balance, 0), sql`${invoices.dueDate} < ${onDate}`))
      .groupBy(classes.name, classes.sortOrder).orderBy(desc(sql`sum(${invoices.balance})`)).limit(6),
    db.select({ month: sql<string>`to_char(${payments.date}, 'YYYY-MM')`, v: sql`sum(${payments.amount})`.mapWith(Number) })
      .from(payments).where(paid).groupBy(sql`to_char(${payments.date}, 'YYYY-MM')`),
    db.select({ month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`, v: sql`sum(${invoices.net})`.mapWith(Number) })
      .from(invoices).where(live).groupBy(sql`to_char(${invoices.issueDate}, 'YYYY-MM')`),
    db.select({ n: sql`count(*)` }).from(notificationOutbox).where(eq(notificationOutbox.status, "failed")),
    db.select({ n: sql`count(*)` }).from(notificationOutbox).where(eq(notificationOutbox.status, "queued")),
  ]);

  // Every month of the session, including empty ones, so the chart always shows 12 bars.
  const months: { month: string; collected: number; billed: number }[] = [];
  for (let m = periodOf(r.yearStart); m <= periodOf(r.yearEnd); ) {
    months.push({ month: m, collected: monthlyPaid.find((x) => x.month === m)?.v ?? 0, billed: monthlyBilled.find((x) => x.month === m)?.v ?? 0 });
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`;
  }

  return {
    period: { collected: num(col?.v), receipts: num(col?.n), billed: num(billed?.v), bills: num(billed?.n), byMode, daily, recent },
    session: { billed: num(session?.billed), collected: num(sessionPaid?.v), outstanding: num(session?.balance), overdue: num(session?.overdue) },
    months, topClasses, failedMessages: num(failed?.n), queuedMessages: num(queued?.n),
  };
}

export async function defaulters(f: { classId?: number; minAmount?: number; minDaysOverdue?: number; onDate?: ISODate }) {
  const onDate = f.onDate ?? today();
  const cutoff = addDays(onDate, -(f.minDaysOverdue ?? 1) + 1);
  const db = getDb();
  const rows = await db.select({
    studentId: students.id, admissionNo: students.admissionNo, name: students.name, className: classes.name,
    due: sql`sum(${invoices.balance})`.mapWith(Number), invoices: sql`count(*)`.mapWith(Number),
    oldestDue: sql<string>`min(${invoices.dueDate})`,
    guardian: sql<string>`(select g.name || ' ' || g.mobile from ${studentGuardians} sg join ${guardians} g on g.id = sg.guardian_id where sg.student_id = ${students.id} order by sg.is_primary desc limit 1)`,
  }).from(invoices).innerJoin(students, eq(students.id, invoices.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .where(and(gt(invoices.balance, 0), ne(invoices.status, "cancelled"), sql`${invoices.dueDate} < ${cutoff}`, f.classId ? eq(students.classId, f.classId) : undefined))
    .groupBy(students.id, classes.name, classes.sortOrder).orderBy(asc(classes.sortOrder), asc(students.name));
  return rows.filter((r) => r.due >= (f.minAmount ?? 0)).map((r) => ({ ...r, daysOverdue: Math.round((Date.parse(onDate) - Date.parse(r.oldestDue)) / 86_400_000) }));
}

export async function collectionReport(from: ISODate, to: ISODate) {
  const db = getDb();
  const range = and(gte(payments.date, from), lte(payments.date, to), eq(payments.status, "valid"));
  const byMode = await db.select({ key: payments.mode, v: sql`sum(${payments.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) }).from(payments).where(range).groupBy(payments.mode);
  const byCashier = await db.select({ key: users.fullName, v: sql`sum(${payments.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) }).from(payments).innerJoin(users, eq(users.id, payments.receivedBy)).where(range).groupBy(users.fullName);
  const byClass = await db.select({ key: classes.name, v: sql`sum(${payments.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) }).from(payments)
    .innerJoin(students, eq(students.id, payments.studentId)).innerJoin(classes, eq(classes.id, students.classId)).where(range).groupBy(classes.name, classes.sortOrder).orderBy(asc(classes.sortOrder));
  const byHead = await db.select({ key: sql<string>`coalesce(${feeHeads.name}, 'Other')`, v: sql`sum(${paymentAllocations.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) })
    .from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .innerJoin(invoiceLines, eq(invoiceLines.id, paymentAllocations.invoiceLineId)).leftJoin(feeHeads, eq(feeHeads.id, invoiceLines.feeHeadId))
    .where(and(range, sql`${paymentAllocations.reversedAt} is null`)).groupBy(feeHeads.name);
  const byDate = await db.select({ key: sql<string>`${payments.date}::text`, v: sql`sum(${payments.amount})`.mapWith(Number), n: sql`count(*)`.mapWith(Number) }).from(payments).where(range).groupBy(payments.date).orderBy(asc(payments.date));
  const [refunded] = await db.select({ v: sql`coalesce(sum(${refunds.amount}),0)`.mapWith(Number) }).from(refunds).where(and(sql`${refunds.createdAt}::date >= ${from}`, sql`${refunds.createdAt}::date <= ${to}`));
  const total = byMode.reduce((a, r) => a + r.v, 0);
  return { byMode, byCashier, byClass, byHead, byDate, total, refunded: refunded?.v ?? 0 };
}

export async function outstandingByClass(onDate: ISODate = today()) {
  return getDb().select({
    className: classes.name,
    billed: sql`sum(${invoices.net})`.mapWith(Number), paid: sql`sum(${invoices.paid})`.mapWith(Number), balance: sql`sum(${invoices.balance})`.mapWith(Number),
    overdue: sql`coalesce(sum(case when ${invoices.dueDate} < ${onDate} then ${invoices.balance} end),0)`.mapWith(Number),
  }).from(invoices).innerJoin(students, eq(students.id, invoices.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .where(ne(invoices.status, "cancelled")).groupBy(classes.name, classes.sortOrder).orderBy(asc(classes.sortOrder));
}

export async function concessionReport(from: ISODate, to: ISODate) {
  return getDb().select({
    head: sql<string>`coalesce(${feeHeads.name}, 'Other')`, discount: sql`sum(${invoiceLines.discount})`.mapWith(Number), lines: sql`count(*)`.mapWith(Number),
  }).from(invoiceLines).innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId)).leftJoin(feeHeads, eq(feeHeads.id, invoiceLines.feeHeadId))
    .where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to), ne(invoices.status, "cancelled"), gt(invoiceLines.discount, 0))).groupBy(feeHeads.name);
}

export async function lateFeeReport(from: ISODate, to: ISODate) {
  const [r] = await getDb().select({
    charged: sql`coalesce(sum(${invoiceLines.amount}),0)`.mapWith(Number), collected: sql`coalesce(sum(${invoiceLines.paid}),0)`.mapWith(Number),
  }).from(invoiceLines).innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoiceLines.kind, "late_fee"), gte(invoices.issueDate, from), lte(invoices.issueDate, to)));
  return r ?? { charged: 0, collected: 0 };
}

export async function cancelledReceipts(from: ISODate, to: ISODate) {
  return getDb().select({ p: payments, studentName: students.name, cashier: users.fullName })
    .from(payments).innerJoin(students, eq(students.id, payments.studentId)).innerJoin(users, eq(users.id, payments.receivedBy))
    .where(and(eq(payments.status, "cancelled"), gte(payments.date, from), lte(payments.date, to))).orderBy(desc(payments.id));
}

export async function auditTrail(f: { table?: string; limit?: number }) {
  return getDb().select({ a: auditLog, username: users.username }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
    .where(f.table ? eq(auditLog.tableName, f.table) : undefined).orderBy(desc(auditLog.id)).limit(f.limit ?? 300);
}

// ---------------------------------------------------------------- exports
export interface Column { header: string; key: string; money?: boolean; width?: number }

/** Excel export for any listed data. Money columns are paise in, rupees out. */
export async function toXlsx(sheet: string, columns: Column[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? (c.money ? 14 : 20), style: c.money ? { numFmt: "#,##,##0.00" } : {} }));
  for (const r of rows) {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c.key] = c.money ? num(r[c.key]) / 100 : r[c.key];
    ws.addRow(out);
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Tally-importable receipt vouchers as CSV (Date, Voucher No, Ledger, Party, Amount, Mode, Narration). */
export async function tallyReceiptsCsv(from: ISODate, to: ISODate): Promise<string> {
  const rows = await getDb().select({ p: payments, name: students.name, adm: students.admissionNo })
    .from(payments).innerJoin(students, eq(students.id, payments.studentId))
    .where(and(gte(payments.date, from), lte(payments.date, to), eq(payments.status, "valid"))).orderBy(asc(payments.id));
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["Date,Voucher Type,Voucher No,Debit Ledger,Credit Ledger,Party,Amount,Narration"];
  for (const r of rows) {
    const [y, m, d] = r.p.date.split("-");
    lines.push([`${d}-${m}-${y}`, "Receipt", r.p.receiptNo, r.p.mode === "cash" ? "Cash" : "Bank", "Fee Receivable", esc(`${r.name} (${r.adm})`),
      (r.p.amount / 100).toFixed(2), esc(`${r.p.mode}${r.p.referenceNo ? " ref " + r.p.referenceNo : ""}`)].join(","));
  }
  return lines.join("\r\n");
}
