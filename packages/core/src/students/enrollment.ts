/**
 * Academic-year enrolments: one record per student per year (class, section, roll).
 * Earlier years are kept as history; student.classId/sectionId/rollNo mirror the latest year.
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import {
  getDb, academicYears, classes, invoices, invoiceLines, sections, studentEnrollments, students, type Executor,
} from "@sb/db";
import { promoteStudentSchema } from "@sb/validation";
import { AppError, audit, type Actor } from "../common";
import { createOpeningBalance } from "../billing";

type EnrollmentStatus = "studying" | "promoted" | "left" | "passed_out";

/** Create or update a student's record for one academic year. */
export async function upsertEnrollment(tx: Executor, e: {
  studentId: number; academicYearId: number; classId: number; sectionId?: number | null; rollNo?: string | null; status?: EnrollmentStatus; note?: string;
}) {
  const values = {
    studentId: e.studentId, academicYearId: e.academicYearId, classId: e.classId,
    sectionId: e.sectionId ?? null, rollNo: e.rollNo || null, status: e.status ?? "studying", note: e.note ?? null,
  };
  const [row] = await tx.insert(studentEnrollments).values(values)
    .onConflictDoUpdate({ target: [studentEnrollments.studentId, studentEnrollments.academicYearId], set: { classId: values.classId, sectionId: values.sectionId, rollNo: values.rollNo, status: values.status } })
    .returning();
  await syncLatest(tx, e.studentId);
  return row!;
}

/** Copy the latest year's class/section/roll onto the student row (used by search, counter, etc.). */
export async function syncLatest(tx: Executor, studentId: number) {
  const [latest] = await tx.select({ e: studentEnrollments }).from(studentEnrollments)
    .innerJoin(academicYears, eq(academicYears.id, studentEnrollments.academicYearId))
    .where(eq(studentEnrollments.studentId, studentId)).orderBy(desc(academicYears.startDate)).limit(1);
  if (latest) await tx.update(students).set({ classId: latest.e.classId, sectionId: latest.e.sectionId, rollNo: latest.e.rollNo }).where(eq(students.id, studentId));
}

/** Year-by-year history for the profile, oldest first. */
export async function listEnrollments(studentId: number) {
  return getDb().select({ e: studentEnrollments, yearName: academicYears.name, yearStart: academicYears.startDate, isCurrent: academicYears.isCurrent, className: classes.name, sectionName: sections.name })
    .from(studentEnrollments)
    .innerJoin(academicYears, eq(academicYears.id, studentEnrollments.academicYearId))
    .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
    .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
    .where(eq(studentEnrollments.studentId, studentId)).orderBy(asc(academicYears.startDate));
}

/** The student's record for one year, if any. */
export async function enrollmentFor(studentId: number, academicYearId: number) {
  const [r] = await getDb().select().from(studentEnrollments)
    .where(and(eq(studentEnrollments.studentId, studentId), eq(studentEnrollments.academicYearId, academicYearId)));
  return r ?? null;
}

/**
 * Promote one student into another academic year. Personal details and guardians are kept;
 * a new year record is created and the previous year is marked "promoted".
 * Optionally moves unpaid dues from earlier years into the new year as an opening-balance bill.
 */
export async function promoteStudent(actor: Actor, input: unknown, tx?: Executor) {
  const d = promoteStudentSchema.parse(input);
  const run = async (t: Executor) => {
    const [s] = await t.select().from(students).where(eq(students.id, d.studentId)).for("update");
    if (!s) throw new AppError("Student not found");
    const [ny] = await t.select().from(academicYears).where(eq(academicYears.id, d.toYearId));
    if (!ny) throw new AppError("Academic year not found");
    const existing = await t.select().from(studentEnrollments)
      .where(and(eq(studentEnrollments.studentId, s.id), eq(studentEnrollments.academicYearId, ny.id)));
    if (existing.length) throw new AppError(`${s.name} already has a record for ${ny.name}. Edit it instead.`);

    // Mark earlier years as finished.
    const earlier = await t.select({ id: studentEnrollments.id }).from(studentEnrollments)
      .innerJoin(academicYears, eq(academicYears.id, studentEnrollments.academicYearId))
      .where(and(eq(studentEnrollments.studentId, s.id), eq(studentEnrollments.status, "studying"), sql`${academicYears.startDate} < ${ny.startDate}`));
    for (const e of earlier) await t.update(studentEnrollments).set({ status: "promoted" }).where(eq(studentEnrollments.id, e.id));

    await upsertEnrollment(t, { studentId: s.id, academicYearId: ny.id, classId: d.classId, sectionId: d.sectionId, rollNo: d.rollNo, status: "studying" });
    if (s.status !== "active") await t.update(students).set({ status: "active", leavingDate: null }).where(eq(students.id, s.id));

    let carried = 0;
    if (d.carryDues) carried = await carryForwardDues(t, actor, s.id, ny.id, ny.name, ny.startDate);
    await audit(t, actor, "promote", "student", s.id, null, { toYear: ny.name, classId: d.classId, carried });
    return { carried, yearName: ny.name };
  };
  return tx ? run(tx) : getDb().transaction(run);
}

/** Close unpaid bills of earlier years and re-bill the total in the new year, keeping the ledger continuous. */
export async function carryForwardDues(tx: Executor, actor: Actor, studentId: number, newYearId: number, newYearName: string, dueDate: string): Promise<number> {
  const old = await tx.select().from(invoices)
    .where(and(eq(invoices.studentId, studentId), ne(invoices.academicYearId, newYearId), sql`${invoices.balance} > 0`, ne(invoices.status, "cancelled")));
  const due = old.reduce((a, i) => a + i.balance, 0);
  if (due <= 0) return 0;
  const exists = await tx.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.studentId, studentId), eq(invoices.academicYearId, newYearId), eq(invoices.period, "OPENING")));
  if (exists.length) return 0;
  for (const i of old) {
    await tx.update(invoiceLines).set({ credited: sql`${invoiceLines.credited} + (${invoiceLines.net} - ${invoiceLines.paid})`, net: sql`${invoiceLines.paid}` })
      .where(and(eq(invoiceLines.invoiceId, i.id), sql`${invoiceLines.net} > ${invoiceLines.paid}`));
    await tx.update(invoices).set({ credited: i.credited + i.balance, net: i.paid, balance: 0, status: "paid", cancelReason: `Carried forward to ${newYearName}` }).where(eq(invoices.id, i.id));
  }
  await createOpeningBalance(tx, actor, studentId, due, newYearId, newYearName, dueDate, "Dues carried forward from previous year");
  return due;
}
