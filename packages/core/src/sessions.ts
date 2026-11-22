/**
 * Class sessions: each class can run on its own dates inside an academic year
 * (e.g. Nursery-UKG January-December while Classes I-XII run April-March).
 * A class without its own dates uses the academic year's dates.
 */
import { and, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { getDb, academicYears, classSessions, classes, invoices, studentEnrollments, type Executor } from "@sb/db";
import { AppError, audit, yearForDate, type Actor } from "./common";
import { addDays, monthOffset, periodOf, type ISODate } from "./dates";
import { compareClasses } from "./classes";

export interface Session { yearId: number; yearName: string; classId: number; startDate: ISODate; endDate: ISODate; custom: boolean }
type Year = typeof academicYears.$inferSelect;

/** Last day a session may end on: 12 months after it starts, minus a day. */
export function maxSessionEnd(start: ISODate): ISODate {
  const [y, m, d] = start.split("-").map(Number);
  return addDays(`${y! + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, -1);
}

/** Is `period` (YYYY-MM) a month of this session? */
export function sessionHasPeriod(s: { startDate: ISODate; endDate: ISODate }, period: string): boolean {
  return monthOffset(s.startDate, period) >= 0 && period <= periodOf(s.endDate);
}
export const sessionHasDate = (s: { startDate: ISODate; endDate: ISODate }, date: ISODate) => date >= s.startDate && date <= s.endDate;

/** Every year × class session (custom dates where set, else the year's dates). */
export async function allSessions(db: Executor = getDb(), yearIds?: number[]): Promise<Map<string, Session>> {
  const years = await db.select().from(academicYears).where(yearIds?.length ? inArray(academicYears.id, yearIds) : undefined);
  const cls = await db.select({ id: classes.id }).from(classes);
  const customSessionsList = await db.select().from(classSessions).where(yearIds?.length ? inArray(classSessions.academicYearId, yearIds) : undefined);
  const out = new Map<string, Session>();
  for (const y of years) for (const c of cls) {
    const override = customSessionsList.find((x) => x.academicYearId === y.id && x.classId === c.id);
    out.set(`${y.id}:${c.id}`, {
      yearId: y.id,
      yearName: y.name,
      classId: c.id,
      startDate: override?.startDate ?? y.startDate,
      endDate: override?.endDate ?? y.endDate,
      custom: !!override,
    });
  }
  return out;
}

export async function sessionOf(db: Executor, yearId: number, classId: number): Promise<Session> {
  const s = (await allSessions(db, [yearId])).get(`${yearId}:${classId}`);
  if (!s) throw new AppError("Academic year or class not found");
  return s;
}

/**
 * The academic year a student's money on `date` belongs to: the year of the class session that covers the date.
 * Falls back to the school-wide year for the date, then to the student's latest year.
 */
export async function studentYearOn(db: Executor, studentId: number, date: ISODate): Promise<Year> {
  const enr = await db.select({ e: studentEnrollments, y: academicYears }).from(studentEnrollments)
    .innerJoin(academicYears, eq(academicYears.id, studentEnrollments.academicYearId))
    .where(eq(studentEnrollments.studentId, studentId)).orderBy(desc(academicYears.startDate));
  if (enr.length) {
    const map = await allSessions(db, enr.map((x) => x.y.id));
    const hit = enr.find((x) => { const s = map.get(`${x.y.id}:${x.e.classId}`); return s && sessionHasDate(s, date); });
    if (hit) return hit.y;
  }
  try { return await yearForDate(db, date); } catch (e) {
    if (enr.length) return enr[0]!.y;
    throw e;
  }
}

/** Sessions of one year, one row per class, for the editor. */
export async function listSessions(yearId: number) {
  const db = getDb();
  const map = await allSessions(db, [yearId]);
  const rawCls = await db.select().from(classes);
  const cls = [...rawCls].sort(compareClasses);
  return cls.map((c) => ({ className: c.name, sortOrder: c.sortOrder, ...map.get(`${yearId}:${c.id}`)! }));
}

/**
 * Set a class's own session dates for a year (or pass null dates to go back to the year's dates).
 * Refused when: end before start; longer than 12 months; overlapping the same class's session in another year;
 * or bills already made for that class in that year fall outside the new dates.
 */
export async function saveClassSession(actor: Actor, input: { yearId: number; classId: number; startDate: ISODate | null; endDate: ISODate | null }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [y] = await tx.select().from(academicYears).where(eq(academicYears.id, input.yearId));
    const [c] = await tx.select().from(classes).where(eq(classes.id, input.classId));
    if (!y || !c) throw new AppError("Academic year or class not found");
    const reset = !input.startDate && !input.endDate;
    const start = reset ? y.startDate : input.startDate;
    const end = reset ? y.endDate : input.endDate;
    if (!start || !end) throw new AppError("Give both the start and the end date", { startDate: "Required", endDate: "Required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new AppError("Use real dates");
    if (end <= start) throw new AppError("The session must end after it starts", { endDate: "Before the start" });
    if (end > maxSessionEnd(start)) throw new AppError(`A session can be at most 12 months (from ${start} it must end by ${maxSessionEnd(start)})`, { endDate: "Longer than 12 months" });

    // No overlap with this class's session in any other year.
    const others = await allSessions(tx);
    for (const s of others.values()) {
      if (s.classId !== c.id || s.yearId === y.id) continue;
      if (start <= s.endDate && end >= s.startDate) {
        throw new AppError(`Class ${c.name} already has a session in ${s.yearName} from ${s.startDate} to ${s.endDate}. Sessions of one class cannot overlap.`, { startDate: "Overlaps" });
      }
    }

    // Monthly bills already made for this class in this year must stay inside the session.
    const billed = await tx.select({ period: invoices.period, n: sql<number>`count(*)::int` }).from(invoices)
      .innerJoin(studentEnrollments, and(eq(studentEnrollments.studentId, invoices.studentId), eq(studentEnrollments.academicYearId, invoices.academicYearId)))
      .where(and(eq(invoices.academicYearId, y.id), eq(studentEnrollments.classId, c.id), ne(invoices.status, "cancelled"), like(invoices.period, "____-__")))
      .groupBy(invoices.period);
    const outside = billed.filter((b) => !sessionHasPeriod({ startDate: start, endDate: end }, b.period));
    if (outside.length) {
      throw new AppError(`Bills already exist for ${outside.map((o) => `${o.period} (${o.n})`).join(", ")}, which would fall outside these dates. Cancel those bills first or choose dates that include them.`);
    }

    const [old] = await tx.select().from(classSessions).where(and(eq(classSessions.academicYearId, y.id), eq(classSessions.classId, c.id)));
    if (reset || (start === y.startDate && end === y.endDate)) {
      if (old) await tx.delete(classSessions).where(eq(classSessions.id, old.id));
    } else {
      await tx.insert(classSessions).values({ academicYearId: y.id, classId: c.id, startDate: start, endDate: end })
        .onConflictDoUpdate({ target: [classSessions.academicYearId, classSessions.classId], set: { startDate: start, endDate: end } });
    }
    await audit(tx, actor, old ? "update" : "create", "class_session", c.id, old ?? null, { year: y.name, className: c.name, startDate: start, endDate: end });
    return { className: c.name, yearName: y.name, startDate: start, endDate: end };
  });
}
