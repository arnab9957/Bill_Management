import { and, asc, desc, eq, gt, inArray, lte, ne, sql, like } from "drizzle-orm";
import {
  getDb, academicYears, classes, concessionTypes, creditNotes, feeHeads, feeStructureItems, feeStructures, invoiceLines,
  invoices, lateFeeRules, sections, students, studentConcessions, transportRoutes, payments, paymentAllocations, studentEnrollments,
  type Executor, type Invoice,
} from "@sb/db";
import { billRunSchema, cancelInvoiceSchema, creditNoteSchema, miscChargeSchema, type BillRunInput } from "@sb/validation";
import { AppError, audit, formatDocNo, getSettings, nextNumber, yearForDate, SYSTEM, type Actor } from "../common";
import { dateInPeriod, formatDate, periodLabel, today, type ISODate } from "../dates";
import { formatINR } from "../money";
import { enqueue, studentVars } from "../notifications";
import { applyWalletToInvoice } from "../payments/wallet";
import { concessionFor, deriveStatus, isDueInPeriod, lateFeeTarget, type ConcessionRule } from "./rules";

export * from "./rules";

// ---------------------------------------------------------------- invoice totals
/** Recompute invoice totals from its lines. Call after any line change, inside the transaction. */
export async function recalcInvoice(tx: Executor, invoiceId: number, onDate: ISODate = today()): Promise<Invoice> {
  const [t] = await tx.select({
    gross: sql<number>`coalesce(sum(case when ${invoiceLines.kind} <> 'late_fee' then ${invoiceLines.amount} end),0)::bigint`,
    lateFee: sql<number>`coalesce(sum(case when ${invoiceLines.kind} = 'late_fee' then ${invoiceLines.amount} end),0)::bigint`,
    discount: sql<number>`coalesce(sum(${invoiceLines.discount}),0)::bigint`,
    credited: sql<number>`coalesce(sum(${invoiceLines.credited}),0)::bigint`,
    net: sql<number>`coalesce(sum(${invoiceLines.net}),0)::bigint`,
    paid: sql<number>`coalesce(sum(${invoiceLines.paid}),0)::bigint`,
  }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const n = (v: unknown) => Number(v ?? 0);
  const [cur] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!cur) throw new AppError("Invoice not found");
  const totals = { gross: n(t?.gross), lateFee: n(t?.lateFee), discount: n(t?.discount), credited: n(t?.credited), net: n(t?.net), paid: n(t?.paid) };
  const balance = cur.status === "cancelled" ? 0 : totals.net - totals.paid;
  const status = deriveStatus({ status: cur.status, net: totals.net, paid: totals.paid, balance, dueDate: cur.dueDate }, onDate);
  const [updated] = await tx.update(invoices).set({ ...totals, balance, status }).where(eq(invoices.id, invoiceId)).returning();
  return updated!;
}

async function newInvoiceNo(tx: Executor, yearName: string) {
  const s = await getSettings(tx);
  return formatDocNo(s.invoicePrefix, yearName, await nextNumber(tx, `INVOICE:${yearName}`));
}

// ---------------------------------------------------------------- bill run
export interface PlannedLine { feeHeadId: number; description: string; amount: number; discount: number; net: number; concession?: string }
export interface PlannedInvoice {
  studentId: number; admissionNo: string; name: string; className: string; dueDate: ISODate;
  lines: PlannedLine[]; net: number;
}
export interface BillRunResult {
  period: string; yearName: string; dryRun: boolean;
  planned: PlannedInvoice[];
  skipped: { studentId: number; name: string; reason: string }[];
  totalNet: number;
  created: { studentId: number; invoiceId: number; invoiceNo: string }[];
}

/**
 * Section 5.3 of the plan. Idempotent: an invoice per (student, year, period)
 * is enforced by a unique index, and existing ones are skipped.
 */
export async function generateInvoices(input: BillRunInput, actor: Actor = SYSTEM): Promise<BillRunResult> {
  const { period, classIds, studentId, dryRun } = billRunSchema.parse(input);
  const db = getDb();
  const periodStart = dateInPeriod(period, 1);
  const year = await yearForDate(db, periodStart);
  const periodEnd = dateInPeriod(period, 28); // admissions up to the 28th are billed for the month

  // Only students enrolled in THIS academic year are billed, with the class they have in this year.
  const conds = [eq(students.status, "active"), lte(students.admissionDate, periodEnd),
    eq(studentEnrollments.academicYearId, year.id), eq(studentEnrollments.status, "studying")];
  if (studentId) conds.push(eq(students.id, studentId));
  else if (classIds.length) conds.push(inArray(studentEnrollments.classId, classIds));
  const enrolled = await db.select({ s: students, classId: studentEnrollments.classId, className: classes.name, route: transportRoutes })
    .from(studentEnrollments).innerJoin(students, eq(students.id, studentEnrollments.studentId))
    .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
    .leftJoin(transportRoutes, eq(transportRoutes.id, students.transportRouteId))
    .where(and(...conds)).orderBy(asc(classes.sortOrder), asc(students.name));
  const studs = enrolled.map((x) => ({ ...x, s: { ...x.s, classId: x.classId } }));

  const result: BillRunResult = { period, yearName: year.name, dryRun, planned: [], skipped: [], totalNet: 0, created: [] };
  if (!studs.length) return result;
  const ids = studs.map((x) => x.s.id);

  const existing = new Set((await db.select({ sid: invoices.studentId }).from(invoices)
    .where(and(eq(invoices.academicYearId, year.id), eq(invoices.period, period), inArray(invoices.studentId, ids)))).map((r) => r.sid));

  const structures = await db.select({ classId: feeStructures.classId, item: feeStructureItems, head: feeHeads })
    .from(feeStructures).innerJoin(feeStructureItems, eq(feeStructureItems.structureId, feeStructures.id))
    .innerJoin(feeHeads, eq(feeHeads.id, feeStructureItems.feeHeadId))
    .where(eq(feeStructures.academicYearId, year.id)).orderBy(asc(feeHeads.sortOrder));
  const byClass = new Map<number, typeof structures>();
  for (const r of structures) byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r]);

  // Which students already had a monthly invoice this year, and which heads were billed.
  const yearInvoices = await db.select({ sid: invoices.studentId, headId: invoiceLines.feeHeadId })
    .from(invoices).innerJoin(invoiceLines, eq(invoiceLines.invoiceId, invoices.id))
    .where(and(eq(invoices.academicYearId, year.id), ne(invoices.status, "cancelled"), inArray(invoices.studentId, ids), like(invoices.period, "____-__")));
  const hadInvoice = new Set(yearInvoices.map((r) => r.sid));
  const billedHead = new Set(yearInvoices.map((r) => `${r.sid}:${r.headId}`));

  const conc = await db.select({ sid: studentConcessions.studentId, t: concessionTypes }).from(studentConcessions)
    .innerJoin(concessionTypes, eq(concessionTypes.id, studentConcessions.concessionTypeId))
    .where(and(inArray(studentConcessions.studentId, ids), eq(studentConcessions.isActive, true),
      lte(studentConcessions.validFrom, periodEnd), sql`(${studentConcessions.validTo} is null or ${studentConcessions.validTo} >= ${periodStart})`,
      sql`${studentConcessions.approvedBy} is not null`));
  const concBy = new Map<number, ConcessionRule[]>();
  for (const c of conc) concBy.set(c.sid, [...(concBy.get(c.sid) ?? []), { name: c.t.name, kind: c.t.kind, value: c.t.value, feeHeadId: c.t.feeHeadId }]);

  const [transportHead] = await db.select().from(feeHeads).where(eq(feeHeads.code, "TRANSPORT"));

  for (const { s, className, route } of studs) {
    if (existing.has(s.id)) { result.skipped.push({ studentId: s.id, name: s.name, reason: "Already billed for this period" }); continue; }
    const items = byClass.get(s.classId);
    if (!items?.length && !route) { result.skipped.push({ studentId: s.id, name: s.name, reason: `No fee structure for class ${className} in ${year.name}` }); continue; }
    const rules = concBy.get(s.id) ?? [];
    const lines: PlannedLine[] = [];
    let dueDay = 28;
    for (const { item, head } of items ?? []) {
      if (!isDueInPeriod(item, period, year.startDate, { firstInvoiceOfYear: !hadInvoice.has(s.id), alreadyBilledThisYear: billedHead.has(`${s.id}:${head.id}`) })) continue;
      // one-time admission-type heads only for students admitted this academic year
      if (item.frequency === "one_time" && s.admissionDate < year.startDate) continue;
      const { discount, names } = concessionFor(head.id, item.amount, rules);
      lines.push({ feeHeadId: head.id, description: `${head.name} – ${periodLabel(period)}`, amount: item.amount, discount, net: item.amount - discount, concession: names.join(", ") || undefined });
      dueDay = Math.min(dueDay, item.dueDay);
    }
    if (route && transportHead && route.monthlyFee > 0) {
      const { discount, names } = concessionFor(transportHead.id, route.monthlyFee, rules);
      lines.push({ feeHeadId: transportHead.id, description: `Transport (${route.name}) – ${periodLabel(period)}`, amount: route.monthlyFee, discount, net: route.monthlyFee - discount, concession: names.join(", ") || undefined });
      dueDay = Math.min(dueDay, 10);
    }
    if (!lines.length) { result.skipped.push({ studentId: s.id, name: s.name, reason: "Nothing due this period" }); continue; }
    const net = lines.reduce((a, l) => a + l.net, 0);
    result.planned.push({ studentId: s.id, admissionNo: s.admissionNo, name: s.name, className, dueDate: dateInPeriod(period, dueDay), lines, net });
    result.totalNet += net;
  }

  if (dryRun) return result;

  const issueDate = today();
  for (const p of result.planned) {
    const created = await db.transaction(async (tx) => {
      // Serialise per student: also blocks a concurrent bill run for the same student.
      await tx.select({ id: students.id }).from(students).where(eq(students.id, p.studentId)).for("update");
      const dup = await tx.select({ id: invoices.id }).from(invoices)
        .where(and(eq(invoices.studentId, p.studentId), eq(invoices.academicYearId, year.id), eq(invoices.period, period)));
      if (dup.length) return null;
      const invoiceNo = await newInvoiceNo(tx, year.name);
      const [inv] = await tx.insert(invoices).values({
        invoiceNo, studentId: p.studentId, academicYearId: year.id, period, issueDate, dueDate: p.dueDate, createdBy: actor.id,
      }).returning();
      await tx.insert(invoiceLines).values(p.lines.map((l) => ({
        invoiceId: inv!.id, feeHeadId: l.feeHeadId, kind: "fee" as const,
        description: l.concession ? `${l.description} (${l.concession} concession)` : l.description,
        amount: l.amount, discount: l.discount, net: l.net,
      })));
      await recalcInvoice(tx, inv!.id);
      await applyWalletToInvoice(tx, p.studentId, inv!.id);
      const final = await recalcInvoice(tx, inv!.id);
      await audit(tx, actor, "create", "invoice", inv!.id, null, { invoiceNo, period, net: final.net, auto: actor.id === null });
      if (final.balance > 0) {
        await enqueue(tx, {
          event: "BILL_GENERATED", keyBase: `BILL_GENERATED:inv:${inv!.id}`, studentIds: [p.studentId], invoiceIds: [inv!.id],
          vars: { ...(await studentVars(tx, p.studentId)), invoice_no: invoiceNo, amount_due: formatINR(final.balance, { symbol: false }), due_date: formatDate(p.dueDate) },
        });
      }
      return { studentId: p.studentId, invoiceId: inv!.id, invoiceNo };
    });
    if (created) result.created.push(created);
  }
  return result;
}

// ---------------------------------------------------------------- single charges
/** Miscellaneous charge (library fine, uniform, books…) as its own invoice. */
export async function addMiscCharge(actor: Actor, input: unknown) {
  const d = miscChargeSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const year = await yearForDate(tx, d.dueDate);
    const [head] = await tx.select().from(feeHeads).where(eq(feeHeads.id, d.feeHeadId));
    if (!head) throw new AppError("Unknown fee head");
    await tx.select({ id: students.id }).from(students).where(eq(students.id, d.studentId)).for("update");
    const invoiceNo = await newInvoiceNo(tx, year.name);
    const [inv] = await tx.insert(invoices).values({
      invoiceNo, studentId: d.studentId, academicYearId: year.id, period: `MISC-${invoiceNo}`, issueDate: today(), dueDate: d.dueDate, createdBy: actor.id,
    }).returning();
    await tx.insert(invoiceLines).values({ invoiceId: inv!.id, feeHeadId: head.id, kind: "misc", description: d.description, amount: d.amount, net: d.amount });
    await recalcInvoice(tx, inv!.id);
    await applyWalletToInvoice(tx, d.studentId, inv!.id);
    const final = await recalcInvoice(tx, inv!.id);
    await audit(tx, actor, "create", "invoice", inv!.id, null, { invoiceNo, misc: d.description, amount: d.amount });
    return final;
  });
}

/** Opening balance carried from the old system or from the previous year. */
export async function createOpeningBalance(tx: Executor, actor: Actor, studentId: number, amount: number, yearId: number, yearName: string, dueDate: ISODate, label = "Opening balance") {
  if (amount <= 0) return null;
  const [head] = await tx.select().from(feeHeads).where(eq(feeHeads.code, "OPENING"));
  const invoiceNo = await newInvoiceNo(tx, yearName);
  const [inv] = await tx.insert(invoices).values({
    invoiceNo, studentId, academicYearId: yearId, period: "OPENING", issueDate: today(), dueDate, createdBy: actor.id,
  }).onConflictDoNothing().returning();
  if (!inv) throw new AppError("An opening balance already exists for this student this year");
  await tx.insert(invoiceLines).values({ invoiceId: inv.id, feeHeadId: head?.id ?? null, kind: "opening", description: label, amount, net: amount });
  const final = await recalcInvoice(tx, inv.id);
  await audit(tx, actor, "create", "invoice", inv.id, null, { invoiceNo, opening: amount });
  return final;
}

// ---------------------------------------------------------------- cancellations
/** Cancel an unpaid invoice. Paid invoices need the receipts cancelled first. */
export async function cancelInvoice(actor: Actor, input: unknown) {
  const d = cancelInvoiceSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, d.invoiceId)).for("update");
    if (!inv) throw new AppError("Invoice not found");
    if (inv.status === "cancelled") throw new AppError("Invoice is already cancelled");
    if (inv.paid > 0) throw new AppError("This invoice has payments against it. Cancel those receipts first, or issue a credit note.");
    const year = await tx.select().from(academicYears).where(eq(academicYears.id, inv.academicYearId));
    const cnNo = formatDocNo("CN", year[0]!.name, await nextNumber(tx, `CREDIT_NOTE:${year[0]!.name}`));
    await tx.insert(creditNotes).values({ creditNoteNo: cnNo, studentId: inv.studentId, invoiceId: inv.id, amount: inv.balance, reason: `Cancellation: ${d.reason}`, createdBy: actor.id! });
    const [after] = await tx.update(invoices).set({ status: "cancelled", balance: 0, cancelReason: d.reason }).where(eq(invoices.id, inv.id)).returning();
    await audit(tx, actor, "cancel", "invoice", inv.id, { status: inv.status, balance: inv.balance }, { status: "cancelled", reason: d.reason, creditNote: cnNo });
    return after!;
  });
}

/** Partial reduction of an invoice (e.g. late concession approval). Reduces lines from the last one backwards. */
export async function issueCreditNote(actor: Actor, input: unknown) {
  const d = creditNoteSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, d.invoiceId)).for("update");
    if (!inv || inv.status === "cancelled") throw new AppError("Invoice not found or cancelled");
    if (d.amount > inv.balance) throw new AppError(`Credit cannot exceed the balance of ${formatINR(inv.balance)}`);
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(desc(invoiceLines.id));
    let left = d.amount;
    for (const l of lines) {
      const room = l.net - l.paid;
      if (left <= 0 || room <= 0) continue;
      const take = Math.min(room, left);
      await tx.update(invoiceLines).set({ credited: l.credited + take, net: l.net - take }).where(eq(invoiceLines.id, l.id));
      left -= take;
    }
    const year = (await tx.select().from(academicYears).where(eq(academicYears.id, inv.academicYearId)))[0]!;
    const cnNo = formatDocNo("CN", year.name, await nextNumber(tx, `CREDIT_NOTE:${year.name}`));
    await tx.insert(creditNotes).values({ creditNoteNo: cnNo, studentId: inv.studentId, invoiceId: inv.id, amount: d.amount, reason: d.reason, createdBy: actor.id! });
    const after = await recalcInvoice(tx, inv.id);
    await audit(tx, actor, "credit_note", "invoice", inv.id, { balance: inv.balance }, { balance: after.balance, creditNote: cnNo, amount: d.amount, reason: d.reason });
    return { creditNoteNo: cnNo, invoice: after };
  });
}

// ---------------------------------------------------------------- daily jobs
/** Refresh overdue status and add late-fee lines per the year's rule. Idempotent per (invoice, step). */
export async function applyLateFees(onDate: ISODate = today()): Promise<{ invoices: number; added: number }> {
  const db = getDb();
  await db.update(invoices).set({ status: "overdue" })
    .where(and(gt(invoices.balance, 0), sql`${invoices.dueDate} < ${onDate}`, inArray(invoices.status, ["issued", "partial"])));

  const [lateHead] = await db.select().from(feeHeads).where(eq(feeHeads.code, "LATE_FEE"));
  const rules = await db.select().from(lateFeeRules).where(eq(lateFeeRules.isActive, true));
  let touched = 0, added = 0;
  for (const rule of rules) {
    const due = await db.select().from(invoices)
      .where(and(eq(invoices.academicYearId, rule.academicYearId), eq(invoices.status, "overdue"), gt(invoices.balance, 0), like(invoices.period, "____-__")));
    for (const inv of due) {
      const target = lateFeeTarget(rule, inv.dueDate, onDate, inv.gross - inv.discount);
      if (!target) continue;
      const delta = target.total - inv.lateFee;
      if (delta <= 0) continue;
      const ok = await db.transaction(async (tx) => {
        await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, inv.id)).for("update");
        const ins = await tx.insert(invoiceLines).values({
          invoiceId: inv.id, feeHeadId: lateHead?.id ?? null, kind: "late_fee", lateFeeStep: target.step,
          description: `Late fee (${formatDate(onDate)})`, amount: delta, net: delta,
        }).onConflictDoNothing().returning({ id: invoiceLines.id });
        if (!ins.length) return false;
        const after = await recalcInvoice(tx, inv.id, onDate);
        await audit(tx, SYSTEM, "late_fee", "invoice", inv.id, { lateFee: inv.lateFee }, { lateFee: after.lateFee, step: target.step });
        // Notify on the first step only, so per-day accrual doesn't spam parents.
        if (inv.lateFee === 0) {
          await enqueue(tx, {
            event: "LATE_FEE_APPLIED", keyBase: `LATE_FEE_APPLIED:inv:${inv.id}`, studentIds: [inv.studentId], invoiceIds: [inv.id],
            vars: { ...(await studentVars(tx, inv.studentId)), invoice_no: inv.invoiceNo, late_fee: formatINR(delta, { symbol: false }), amount_due: formatINR(after.balance, { symbol: false }) },
          });
        }
        return true;
      });
      if (ok) { added++; touched++; }
    }
  }
  return { invoices: touched, added };
}

// ---------------------------------------------------------------- queries
export async function getInvoice(id: number) {
  const db = getDb();
  const [row] = await db.select({ inv: invoices, student: students, className: classes.name, sectionName: sections.name, yearName: academicYears.name })
    .from(invoices).innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(classes, eq(classes.id, students.classId)).leftJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(academicYears, eq(academicYears.id, invoices.academicYearId))
    .where(eq(invoices.id, id));
  if (!row) return null;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(asc(invoiceLines.id));
  const allocs = await db.select({ a: paymentAllocations, receiptNo: payments.receiptNo, date: payments.date, status: payments.status })
    .from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(eq(paymentAllocations.invoiceId, id)).orderBy(asc(paymentAllocations.id));
  const cns = await db.select().from(creditNotes).where(eq(creditNotes.invoiceId, id));
  return { ...row, lines, allocations: allocs, creditNotes: cns };
}

export async function listInvoices(f: { period?: string; classId?: number; status?: string; q?: string; limit?: number; yearId?: number }) {
  const db = getDb();
  const conds = [];
  if (f.yearId) conds.push(eq(invoices.academicYearId, f.yearId));
  if (f.period) conds.push(eq(invoices.period, f.period));
  if (f.classId) conds.push(eq(students.classId, f.classId));
  if (f.status) conds.push(eq(invoices.status, f.status as Invoice["status"]));
  if (f.q) conds.push(sql`(${students.name} ilike ${"%" + f.q + "%"} or ${students.admissionNo} ilike ${f.q + "%"} or ${invoices.invoiceNo} ilike ${"%" + f.q + "%"})`);
  return db.select({ inv: invoices, studentName: students.name, admissionNo: students.admissionNo, className: classes.name })
    .from(invoices).innerJoin(students, eq(students.id, invoices.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(invoices.id)).limit(f.limit ?? 200);
}

