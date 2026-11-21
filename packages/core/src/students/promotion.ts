/**
 * Promotion page logic: any class can be promoted at any time (classes may have different session dates).
 * For each student the user chooses: promote (to the next class), repeat (same class, failed), leave, or not now.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  getDb, academicYears, classes, feeStructureItems, feeStructures, invoices, payments, sections, studentEnrollments, students, type Executor,
} from "@sb/db";
import { AppError, audit, type Actor } from "../common";
import { today } from "../dates";
import { allSessions, saveClassSession } from "../sessions";
import { copyStructures, createYear } from "../fees";
import { promoteStudent, syncLatest } from "./enrollment";

export type PromoteAction = "promote" | "repeat" | "leave" | "skip";

async function ordered(db: Executor) {
  return db.select().from(classes).orderBy(asc(classes.sortOrder), asc(classes.name));
}
/** The class after this one by class order; null for the highest class (passes out). */
export function nextClassOf(list: { id: number }[], classId: number): number | null {
  const i = list.findIndex((c) => c.id === classId);
  return i >= 0 && i < list.length - 1 ? list[i + 1]!.id : null;
}

/** One row per class: who is studying in the old year, where they go by default, and what is ready in the new year. */
export async function promotionOverview(fromYearId: number, toYearId: number) {
  const db = getDb();
  const cls = await ordered(db);
  const sess = await allSessions(db, [fromYearId, toYearId]);
  const enr = await db.select({ e: studentEnrollments, active: students.status }).from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId))
    .where(eq(studentEnrollments.academicYearId, fromYearId));
  const inTarget = new Set((await db.select({ sid: studentEnrollments.studentId }).from(studentEnrollments)
    .where(eq(studentEnrollments.academicYearId, toYearId))).map((r) => r.sid));
  const withFees = new Set((await db.select({ classId: feeStructures.classId }).from(feeStructures)
    .innerJoin(feeStructureItems, eq(feeStructureItems.structureId, feeStructures.id))
    .where(eq(feeStructures.academicYearId, toYearId))).map((r) => r.classId));
  return cls.map((c) => {
    const mine = enr.filter((x) => x.e.classId === c.id);
    const waiting = mine.filter((x) => x.e.status === "studying" && x.active === "active" && !inTarget.has(x.e.studentId));
    const done = mine.filter((x) => inTarget.has(x.e.studentId) || x.e.status === "passed_out").length;
    const next = nextClassOf(cls, c.id);
    return {
      classId: c.id, className: c.name, waiting: waiting.length, done,
      defaultTo: next, defaultToName: next ? cls.find((x) => x.id === next)!.name : "Passed out",
      targetHasFees: next ? withFees.has(next) : true, repeatHasFees: withFees.has(c.id),
      fromSession: sess.get(`${fromYearId}:${c.id}`)!, toSession: next ? sess.get(`${toYearId}:${next}`)! : null,
    };
  });
}

/** Students of one class in the old year, with their dues and whether they are already in the new year. */
export async function promotionList(fromYearId: number, classId: number, toYearId: number) {
  const db = getDb();
  const rows = await db.select({ e: studentEnrollments, s: students, sectionName: sections.name }).from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId)).leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
    .where(and(eq(studentEnrollments.academicYearId, fromYearId), eq(studentEnrollments.classId, classId)))
    .orderBy(asc(sections.name), asc(students.name));
  const ids = rows.map((r) => r.s.id);
  const dues = ids.length ? await db.select({ sid: invoices.studentId, v: sql<string>`sum(${invoices.balance})` }).from(invoices)
    .where(and(inArray(invoices.studentId, ids), ne(invoices.status, "cancelled"))).groupBy(invoices.studentId) : [];
  const target = ids.length ? await db.select({ e: studentEnrollments, className: classes.name }).from(studentEnrollments)
    .innerJoin(classes, eq(classes.id, studentEnrollments.classId))
    .where(and(inArray(studentEnrollments.studentId, ids), eq(studentEnrollments.academicYearId, toYearId))) : [];
  return rows.map((r) => {
    const t = target.find((x) => x.e.studentId === r.s.id);
    return {
      studentId: r.s.id, admissionNo: r.s.admissionNo, name: r.s.name, sectionName: r.sectionName, rollNo: r.e.rollNo,
      status: r.s.status, yearStatus: r.e.status, dues: Number(dues.find((d) => d.sid === r.s.id)?.v ?? 0),
      movedTo: t ? t.className : r.e.status === "passed_out" ? "Passed out" : null,
      canPromote: !t && r.e.status === "studying" && r.s.status === "active",
    };
  });
}

/**
 * Promote one class, student by student. One transaction; two people promoting the same class at once
 * cannot both run (the second waits, then finds the students already moved and skips them).
 */
export async function promoteStudents(actor: Actor, args: {
  fromYearId: number; toYearId: number; classId: number;
  /** class to promote into, or "alumni" for the highest class */
  toClassId: number | "alumni";
  rollMode: "keep" | "clear";
  decisions: { studentId: number; action: PromoteAction }[];
}) {
  if (args.fromYearId === args.toYearId) throw new AppError("Choose a different academic year to promote into");
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${7700000 + args.classId}, ${args.toYearId})`);
    const [from] = await tx.select().from(academicYears).where(eq(academicYears.id, args.fromYearId));
    const [to] = await tx.select().from(academicYears).where(eq(academicYears.id, args.toYearId));
    if (!from || !to) throw new AppError("Academic year not found");
    if (to.startDate <= from.startDate) throw new AppError(`${to.name} starts before ${from.name}. Promote into a later year.`);
    const secs = await tx.select().from(sections);
    const out = { promoted: 0, repeated: 0, passedOut: 0, left: 0, skipped: 0, carried: 0, problems: [] as string[] };

    for (const d of args.decisions) {
      if (d.action === "skip") { out.skipped++; continue; }
      const [row] = await tx.select({ e: studentEnrollments, s: students }).from(studentEnrollments)
        .innerJoin(students, eq(students.id, studentEnrollments.studentId))
        .where(and(eq(studentEnrollments.studentId, d.studentId), eq(studentEnrollments.academicYearId, args.fromYearId), eq(studentEnrollments.classId, args.classId)));
      if (!row) { out.problems.push(`Student ${d.studentId} is not in this class in ${from.name}`); continue; }
      const { e, s } = row;
      if (e.status !== "studying" || s.status !== "active") { out.skipped++; out.problems.push(`${s.name}: not studying (${e.status}/${s.status}), skipped`); continue; }
      const already = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
        .where(and(eq(studentEnrollments.studentId, s.id), eq(studentEnrollments.academicYearId, to.id)));
      if (already.length) { out.skipped++; out.problems.push(`${s.name} already has a record in ${to.name}, skipped`); continue; }

      if (d.action === "leave") {
        await tx.update(studentEnrollments).set({ status: "left" }).where(eq(studentEnrollments.id, e.id));
        await tx.update(students).set({ status: "left", leavingDate: today() }).where(eq(students.id, s.id));
        await audit(tx, actor, "status", "student", s.id, { status: s.status }, { status: "left", at: "promotion" });
        out.left++;
        continue;
      }
      if (d.action === "promote" && args.toClassId === "alumni") {
        // Passed out: dues stay on the old year's bills and remain collectable.
        await tx.update(studentEnrollments).set({ status: "passed_out" }).where(eq(studentEnrollments.id, e.id));
        await tx.update(students).set({ status: "alumni", leavingDate: today() }).where(eq(students.id, s.id));
        await audit(tx, actor, "promote", "student", s.id, null, { from: from.name, to: "passed out" });
        out.passedOut++;
        continue;
      }
      const classId = d.action === "repeat" ? args.classId : (args.toClassId as number);
      const oldSec = secs.find((x) => x.id === e.sectionId);
      const sectionId = oldSec ? secs.find((x) => x.classId === classId && x.name === oldSec.name)?.id : undefined;
      const r = await promoteStudent(actor, {
        studentId: s.id, toYearId: to.id, classId, sectionId, rollNo: args.rollMode === "keep" ? e.rollNo ?? "" : "", carryDues: true,
      }, tx);
      if (r.carried) out.carried++;
      if (d.action === "repeat") out.repeated++; else out.promoted++;
    }
    await audit(tx, actor, "promote", "class", args.classId, null, { from: from.name, to: to.name, toClass: args.toClassId, ...out, problems: out.problems.length });
    return out;
  });
}

/**
 * Undo a promotion for one student: only while nothing has happened in the new year
 * (no bills, no carried dues, no receipts). The old year's record goes back to "studying".
 */
export async function undoPromotion(actor: Actor, studentId: number, toYearId: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(students).where(eq(students.id, studentId)).for("update");
    if (!s) throw new AppError("Student not found");
    const [to] = await tx.select().from(academicYears).where(eq(academicYears.id, toYearId));
    if (!to) throw new AppError("Academic year not found");
    const [newRec] = await tx.select().from(studentEnrollments).where(and(eq(studentEnrollments.studentId, studentId), eq(studentEnrollments.academicYearId, toYearId)));
    const [prev] = await tx.select({ e: studentEnrollments }).from(studentEnrollments)
      .innerJoin(academicYears, eq(academicYears.id, studentEnrollments.academicYearId))
      .where(and(eq(studentEnrollments.studentId, studentId), sql`${academicYears.startDate} < ${to.startDate}`))
      .orderBy(desc(academicYears.startDate)).limit(1);

    if (!newRec) {
      // Passed out / left at promotion: bring them back.
      if (!prev || !["passed_out", "left"].includes(prev.e.status)) throw new AppError(`${s.name} was not promoted into ${to.name}`);
      await tx.update(studentEnrollments).set({ status: "studying" }).where(eq(studentEnrollments.id, prev.e.id));
      await tx.update(students).set({ status: "active", leavingDate: null }).where(eq(students.id, studentId));
      await audit(tx, actor, "undo_promote", "student", studentId, { status: prev.e.status }, { status: "studying" });
      return { name: s.name };
    }
    const bills = await tx.select({ period: invoices.period }).from(invoices)
      .where(and(eq(invoices.studentId, studentId), eq(invoices.academicYearId, toYearId), ne(invoices.status, "cancelled")));
    if (bills.some((b) => b.period === "OPENING")) throw new AppError(`${s.name}'s old dues were carried into ${to.name}, so this promotion can't be undone automatically. Change the class on the student's page instead.`);
    if (bills.length) throw new AppError(`${s.name} already has ${bills.length} bill(s) in ${to.name}. Cancel them first, or change the class on the student's page.`);
    const paid = await tx.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.studentId, studentId), eq(payments.academicYearId, toYearId), eq(payments.status, "valid")));
    if (paid.length) throw new AppError(`${s.name} has receipts in ${to.name}; this promotion can't be undone.`);

    await tx.delete(studentEnrollments).where(eq(studentEnrollments.id, newRec.id));
    if (prev && prev.e.status === "promoted") await tx.update(studentEnrollments).set({ status: "studying" }).where(eq(studentEnrollments.id, prev.e.id));
    await syncLatest(tx, studentId);
    await audit(tx, actor, "undo_promote", "student", studentId, { year: to.name, classId: newRec.classId }, null);
    return { name: s.name };
  });
}

// ---------------------------------------------------------------- automatic promotion
const shiftYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
/** "2026-27" → "2027-28" */
export const nextYearName = (n: string) => { const y = Number(n.slice(0, 4)) + 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; };

/**
 * Make sure the academic year after `fromYearId` exists and is ready, copying the previous year:
 * same dates one year later, the same fees (only when the new year has none yet), and each class's own session dates one year later.
 */
export async function prepareNextYear(actor: Actor, fromYearId: number) {
  const db = getDb();
  const years = await db.select().from(academicYears).orderBy(asc(academicYears.startDate));
  const from = years.find((y) => y.id === fromYearId);
  if (!from) throw new AppError("Academic year not found");
  const notes: string[] = [];
  let to = years.find((y) => y.startDate > from.startDate);
  if (!to) {
    to = await createYear(actor, { name: nextYearName(from.name), startDate: shiftYear(from.startDate), endDate: shiftYear(from.endDate) });
    notes.push(`Created academic year ${to.name}`);
  }
  const hasFees = await db.select({ id: feeStructureItems.id }).from(feeStructureItems)
    .innerJoin(feeStructures, eq(feeStructures.id, feeStructureItems.structureId)).where(eq(feeStructures.academicYearId, to.id)).limit(1);
  if (!hasFees.length) {
    const r = await copyStructures(actor, from.id, to.id, 0);
    if (r.copied) notes.push(`Copied fees from ${from.name} (same amounts; change them under Fee setup)`);
  }
  const sess = await allSessions(db, [from.id, to.id]);
  const cls = await ordered(db);
  for (const s of sess.values()) {
    if (s.yearId !== from.id || !s.custom) continue;
    if (sess.get(`${to.id}:${s.classId}`)?.custom) continue; // already has its own dates
    try {
      await saveClassSession(actor, { yearId: to.id, classId: s.classId, startDate: shiftYear(s.startDate), endDate: shiftYear(s.endDate) });
      notes.push(`Class ${cls.find((c) => c.id === s.classId)?.name}: session ${shiftYear(s.startDate)} to ${shiftYear(s.endDate)}`);
    } catch { /* stays on the year's dates; can be set on the page */ }
  }
  return { to, notes };
}

/**
 * One click: every class whose session has ended is promoted to the next class (highest class → passed out),
 * keeping section and roll number and carrying unpaid dues. Classes still running are left alone.
 * Exceptions (failed, left) are fixed afterwards with changePromotion / undoPromotion.
 */
export async function autoPromote(actor: Actor, fromYearId: number, onDate: string = today()) {
  const { to, notes } = await prepareNextYear(actor, fromYearId);
  const overview = await promotionOverview(fromYearId, to.id);
  const due = overview.filter((r) => r.waiting > 0 && r.fromSession.endDate < onDate).reverse(); // highest class first
  const done: { className: string; toName: string; students: number; carried: number }[] = [];
  for (const r of due) {
    const list = (await promotionList(fromYearId, r.classId, to.id)).filter((s) => s.canPromote);
    const res = await promoteStudents(actor, {
      fromYearId, toYearId: to.id, classId: r.classId, toClassId: r.defaultTo ?? "alumni", rollMode: "keep",
      decisions: list.map((s) => ({ studentId: s.studentId, action: "promote" as const })),
    });
    done.push({ className: r.className, toName: r.defaultToName, students: res.promoted + res.passedOut, carried: res.carried });
  }
  const waiting = overview.filter((r) => r.waiting > 0 && r.fromSession.endDate >= onDate)
    .map((r) => ({ className: r.className, endsOn: r.fromSession.endDate, students: r.waiting }));
  return { toYear: to, notes, done, waiting };
}

/** Classes ready for automatic promotion (session ended, students still waiting), and the next session to end. */
export async function autoPromoteReady(fromYearId: number, onDate: string = today()) {
  const db = getDb();
  const sess = await allSessions(db, [fromYearId]);
  const enr = await db.select({ e: studentEnrollments, st: students.status }).from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId)).where(eq(studentEnrollments.academicYearId, fromYearId));
  const [from] = await db.select().from(academicYears).where(eq(academicYears.id, fromYearId));
  const [nextY] = from ? await db.select().from(academicYears).where(sql`${academicYears.startDate} > ${from.startDate}`).orderBy(asc(academicYears.startDate)).limit(1) : [];
  const moved = new Set(nextY ? (await db.select({ sid: studentEnrollments.studentId }).from(studentEnrollments).where(eq(studentEnrollments.academicYearId, nextY.id))).map((r) => r.sid) : []);
  const cls = await ordered(db);
  const rows = cls.map((c) => ({
    className: c.name, endsOn: sess.get(`${fromYearId}:${c.id}`)!.endDate,
    waiting: enr.filter((x) => x.e.classId === c.id && x.e.status === "studying" && x.st === "active" && !moved.has(x.e.studentId)).length,
  })).filter((r) => r.waiting > 0);
  const ready = rows.filter((r) => r.endsOn < onDate);
  const later = rows.filter((r) => r.endsOn >= onDate).sort((a, b) => a.endsOn.localeCompare(b.endsOn));
  return { ready, students: ready.reduce((a, r) => a + r.waiting, 0), nextEnd: later[0] ?? null, nextYearName: nextY?.name ?? (from ? nextYearName(from.name) : "") , nextYearExists: !!nextY };
}

/**
 * Fix one student after promotion: put them in the next class, back in the same class (repeat), or mark them as left.
 * Works even when old dues were carried forward; refused once monthly bills exist in the new year.
 */
export async function changePromotion(actor: Actor, args: { studentId: number; fromYearId: number; toYearId: number; action: "promote" | "repeat" | "leave" }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(students).where(eq(students.id, args.studentId)).for("update");
    if (!s) throw new AppError("Student not found");
    const [old] = await tx.select().from(studentEnrollments).where(and(eq(studentEnrollments.studentId, s.id), eq(studentEnrollments.academicYearId, args.fromYearId)));
    const [rec] = await tx.select().from(studentEnrollments).where(and(eq(studentEnrollments.studentId, s.id), eq(studentEnrollments.academicYearId, args.toYearId)));
    if (!old || !rec) throw new AppError(`${s.name} was not promoted into this year; use Promote instead`);
    const monthly = (await tx.select({ period: invoices.period }).from(invoices)
      .where(and(eq(invoices.studentId, s.id), eq(invoices.academicYearId, args.toYearId), ne(invoices.status, "cancelled"))))
      .filter((i) => /^\d{4}-\d{2}$/.test(i.period));
    if (monthly.length) throw new AppError(`${s.name} already has ${monthly.length} monthly bill(s) in the new year. Cancel them first, then change.`);
    if (args.action === "leave") {
      await tx.update(studentEnrollments).set({ status: "left" }).where(eq(studentEnrollments.id, rec.id));
      await tx.update(students).set({ status: "left", leavingDate: today() }).where(eq(students.id, s.id));
      await audit(tx, actor, "status", "student", s.id, { status: s.status }, { status: "left", at: "promotion change" });
      return { name: s.name, now: "Left school" };
    }
    const cls = await ordered(tx);
    const classId = args.action === "repeat" ? old.classId : nextClassOf(cls, old.classId);
    if (!classId) throw new AppError("This is the highest class: use Undo, then promote as Passed out");
    const secs = await tx.select().from(sections);
    const oldSec = secs.find((x) => x.id === old.sectionId);
    const sectionId = oldSec ? secs.find((x) => x.classId === classId && x.name === oldSec.name)?.id ?? null : null;
    await tx.update(studentEnrollments).set({ classId, sectionId, status: "studying" }).where(eq(studentEnrollments.id, rec.id));
    if (s.status !== "active") await tx.update(students).set({ status: "active", leavingDate: null }).where(eq(students.id, s.id));
    await syncLatest(tx, s.id);
    await audit(tx, actor, "update", "student_enrollment", rec.id, { classId: rec.classId }, { classId, action: args.action });
    return { name: s.name, now: `Class ${cls.find((c) => c.id === classId)!.name}` };
  });
}
