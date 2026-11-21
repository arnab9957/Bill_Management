import { and, asc, count, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  getDb, academicYears, classes, concessionTypes, feeHeads, feeStructureItems, feeStructures, lateFeeRules, sections,
  studentConcessions, studentEnrollments, transportRoutes, students,
} from "@sb/db";
import {
  concessionTypeSchema, feeHeadSchema, lateFeeRuleSchema, receiptRowsSchema, structureItemSchema, studentConcessionSchema, isoDate, z,
} from "@sb/validation";
import { AppError, audit, getSettings, type Actor } from "../common";
import { percentOf } from "../money";

// ---------------------------------------------------------------- masters
let mastersCache: { at: number; data: Awaited<ReturnType<typeof loadMasters>> } | undefined;
const MASTERS_TTL_MS = 30_000;
export const clearMastersCache = () => { mastersCache = undefined; };

async function loadMasters() {
  const db = getDb();
  const [years, cls, secs, routes, heads] = await Promise.all([
    db.select().from(academicYears).orderBy(asc(academicYears.startDate)),
    db.select().from(classes).orderBy(asc(classes.sortOrder)),
    db.select().from(sections).orderBy(asc(sections.name)),
    db.select().from(transportRoutes).orderBy(asc(transportRoutes.name)),
    db.select().from(feeHeads).orderBy(asc(feeHeads.sortOrder)),
  ]);
  return { years, classes: cls, sections: secs, routes, heads };
}

export async function masters(forceRefresh = false) {
  if (!forceRefresh && mastersCache && Date.now() - mastersCache.at < MASTERS_TTL_MS) {
    return mastersCache.data;
  }
  const data = await loadMasters();
  mastersCache = { at: Date.now(), data };
  return data;
}

const yearSchema = z.object({
  name: z.string().regex(/^\d{4}-\d{2}$/, "Use e.g. 2027-28"),
  startDate: isoDate,
  endDate: isoDate,
}).refine((d) => d.startDate < d.endDate, { message: "End must be after start", path: ["endDate"] })
  .refine((d) => d.endDate <= `${Number(d.startDate.slice(0, 4)) + 1}${d.startDate.slice(4)}`, { message: "An academic year can be at most 12 months", path: ["endDate"] })
  .refine((d) => d.name.slice(0, 4) === d.startDate.slice(0, 4) && Number(d.name.slice(5)) === (Number(d.name.slice(2, 4)) + 1) % 100,
    { message: "The name must match the start year, e.g. a year starting in 2027 is 2027-28", path: ["name"] });

export async function createYear(actor: Actor, input: unknown) {
  const d = yearSchema.parse(input);
  const db = getDb();
  const clash = await db.select().from(academicYears).where(sql`${academicYears.startDate} <= ${d.endDate} and ${academicYears.endDate} >= ${d.startDate}`);
  if (clash.length) throw new AppError(`These dates overlap academic year ${clash[0]!.name} (${clash[0]!.startDate} to ${clash[0]!.endDate}). Academic years cannot overlap.`, { startDate: "Overlaps" });
  if ((await db.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.name, d.name))).length) throw new AppError(`Academic year ${d.name} already exists`, { name: "Already exists" });
  const [y] = await db.insert(academicYears).values(d).returning();
  await audit(db, actor, "create", "academic_year", y!.id, null, d);
  clearMastersCache();
  return y!;
}
export async function setCurrentYear(actor: Actor, yearId: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(academicYears).set({ isCurrent: false }).where(eq(academicYears.isCurrent, true));
    await tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, yearId));
    await audit(tx, actor, "set_current", "academic_year", yearId);
  });
  clearMastersCache();
}
export async function createClass(actor: Actor, name: string, sortOrder: number) {
  const db = getDb();
  const [c] = await db.insert(classes).values({ name: z.string().trim().min(1).parse(name), sortOrder }).returning();
  await audit(db, actor, "create", "class", c!.id, null, { name });
  clearMastersCache();
  return c!;
}
export async function createSection(actor: Actor, classId: number, name: string) {
  const db = getDb();
  const [s] = await db.insert(sections).values({ classId, name: z.string().trim().min(1).parse(name) }).onConflictDoNothing().returning();
  if (!s) throw new AppError("Section already exists");
  await audit(db, actor, "create", "section", s.id, null, { classId, name });
  clearMastersCache();
  return s;
}

export async function addClassWithSection(actor: Actor, className: string, sortOrder: number, sectionName: string, studentIds: number[] = [], classId?: number) {
  const db = getDb();
  const name = z.string().trim().max(32).parse(className);
  const section = z.string().trim().max(16).parse(sectionName);
  const ids = [...new Set(studentIds.map(Number).filter(Number.isFinite))];
  return db.transaction(async (tx) => {
    const [found] = classId
      ? await tx.select().from(classes).where(eq(classes.id, classId)).limit(1)
      : name ? await tx.select().from(classes).where(sql`lower(${classes.name}) = lower(${name})`).limit(1) : [];
    let cls = found;
    let created = false;
    if (!cls) {
      if (!name) throw new AppError("Class not found");
      const [inserted] = await tx.insert(classes).values({ name, sortOrder }).returning();
      cls = inserted!;
      created = true;
      await audit(tx, actor, "create", "class", cls.id, null, { name, sortOrder });
    }
    let sectionAdded = false;
    let moved = 0;
    if (section) {
      const [duplicate] = await tx.select({ id: sections.id }).from(sections)
        .where(and(eq(sections.classId, cls.id), sql`lower(${sections.name}) = lower(${section})`)).limit(1);
      if (duplicate) throw new AppError("That section already exists in this class");
      const [s] = await tx.insert(sections).values({ classId: cls.id, name: section }).onConflictDoNothing().returning();
      if (!s) throw new AppError("That section already exists in this class");
      sectionAdded = true;
      await audit(tx, actor, "create", "section", s.id, null, { classId: cls.id, name: section });
      if (ids.length) {
        const affected = await tx.update(students).set({ sectionId: s.id })
          .where(and(eq(students.classId, cls.id), inArray(students.id, ids))).returning({ id: students.id });
        if (affected.length !== ids.length) throw new AppError("Some selected students do not belong to this class");
        await tx.update(studentEnrollments).set({ sectionId: s.id })
          .where(and(eq(studentEnrollments.classId, cls.id), inArray(studentEnrollments.studentId, ids)));
        moved = affected.length;
        if (moved) await audit(tx, actor, "assign_section", "section", s.id, null, { classId: cls.id, name: section, students: moved });
      }
    } else if (!created) {
      throw new AppError("Class already exists. Enter a section to add to it.");
    }
    clearMastersCache();
    return { cls, created, sectionAdded, moved };
  });
}

export async function renameClass(actor: Actor, classId: number, name: string) {
  const db = getDb();
  const clean = z.string().trim().min(1).max(32).parse(name);
  const [old] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!old) throw new AppError("Class not found");
  const [duplicate] = await db.select({ id: classes.id }).from(classes)
    .where(and(ne(classes.id, classId), sql`lower(${classes.name}) = lower(${clean})`)).limit(1);
  if (duplicate) throw new AppError("A class with this name already exists");
  const [updated] = await db.update(classes).set({ name: clean }).where(eq(classes.id, classId)).returning();
  await audit(db, actor, "update", "class", classId, old, updated);
  clearMastersCache();
  return updated!;
}

export async function renameSection(actor: Actor, sectionId: number, name: string) {
  const db = getDb();
  const clean = z.string().trim().min(1).max(16).parse(name);
  const [old] = await db.select().from(sections).where(eq(sections.id, sectionId));
  if (!old) throw new AppError("Section not found");
  const [duplicate] = await db.select({ id: sections.id }).from(sections)
    .where(and(ne(sections.id, sectionId), eq(sections.classId, old.classId), sql`lower(${sections.name}) = lower(${clean})`)).limit(1);
  if (duplicate) throw new AppError("A section with this name already exists in this class");
  const [updated] = await db.update(sections).set({ name: clean }).where(eq(sections.id, sectionId)).returning();
  await audit(db, actor, "update", "section", sectionId, old, updated);
  clearMastersCache();
  return updated!;
}

/** Classes and sections with at least one student now or in past enrolments. */
export async function classSectionUsage() {
  const db = getDb();
  const [studentClasses, studentSections, enrolmentClasses, enrolmentSections, sectionless] = await Promise.all([
    db.selectDistinct({ id: students.classId }).from(students),
    db.selectDistinct({ id: students.sectionId }).from(students).where(isNotNull(students.sectionId)),
    db.selectDistinct({ id: studentEnrollments.classId }).from(studentEnrollments),
    db.selectDistinct({ id: studentEnrollments.sectionId }).from(studentEnrollments).where(isNotNull(studentEnrollments.sectionId)),
    db.select({ id: students.classId, n: count() }).from(students).where(isNull(students.sectionId)).groupBy(students.classId),
  ]);
  const ids = (rows: { id: number | null }[]) => new Set(rows.map((r) => r.id).filter((id): id is number => id != null));
  return {
    usedClassIds: new Set([...ids(studentClasses), ...ids(enrolmentClasses)]),
    usedSectionIds: new Set([...ids(studentSections), ...ids(enrolmentSections)]),
    sectionlessCounts: new Map(sectionless.map((r) => [r.id, Number(r.n)])),
  };
}

/** Current students of every class, with their current section name, for section-assignment checklists. */
export async function classStudentLists() {
  const rows = await getDb().select({ id: students.id, name: students.name, classId: students.classId, sectionName: sections.name })
    .from(students).leftJoin(sections, eq(sections.id, students.sectionId)).orderBy(asc(students.name));
  const map = new Map<number, { id: number; name: string; section: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.classId) ?? [];
    list.push({ id: r.id, name: r.name, section: r.sectionName });
    map.set(r.classId, list);
  }
  return map;
}

export async function removeSection(actor: Actor, sectionId: number) {
  const db = getDb();
  const [section] = await db.select().from(sections).where(eq(sections.id, sectionId));
  if (!section) throw new AppError("Section not found");
  const [student] = await db.select({ id: students.id }).from(students).where(eq(students.sectionId, sectionId)).limit(1);
  const [enrolment] = await db.select({ id: studentEnrollments.id }).from(studentEnrollments).where(eq(studentEnrollments.sectionId, sectionId)).limit(1);
  if (student || enrolment) throw new AppError(`Section ${section.name} has students, so it cannot be removed`);
  await db.delete(sections).where(eq(sections.id, sectionId));
  await audit(db, actor, "delete", "section", sectionId, section, null);
  clearMastersCache();
  return section;
}

export async function removeClass(actor: Actor, classId: number) {
  const db = getDb();
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId));
  if (!cls) throw new AppError("Class not found");
  const [student] = await db.select({ id: students.id }).from(students).where(eq(students.classId, classId)).limit(1);
  const [enrolment] = await db.select({ id: studentEnrollments.id }).from(studentEnrollments).where(eq(studentEnrollments.classId, classId)).limit(1);
  if (student || enrolment) throw new AppError(`Class ${cls.name} has students, so it cannot be removed`);
  return db.transaction(async (tx) => {
    const ownSections = await tx.select({ id: sections.id }).from(sections).where(eq(sections.classId, classId));
    if (ownSections.length) {
      const ids = ownSections.map((s) => s.id);
      const [sectionStudent] = await tx.select({ id: students.id }).from(students).where(inArray(students.sectionId, ids)).limit(1);
      const [sectionEnrolment] = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments).where(inArray(studentEnrollments.sectionId, ids)).limit(1);
      if (sectionStudent || sectionEnrolment) throw new AppError(`Class ${cls.name} has students, so it cannot be removed`);
    }
    const structures = await tx.select({ id: feeStructures.id }).from(feeStructures).where(eq(feeStructures.classId, classId));
    for (const s of structures) await tx.delete(feeStructureItems).where(eq(feeStructureItems.structureId, s.id));
    await tx.delete(feeStructures).where(eq(feeStructures.classId, classId));
    await tx.delete(sections).where(eq(sections.classId, classId));
    await tx.delete(classes).where(eq(classes.id, classId));
    await audit(tx, actor, "delete", "class", classId, cls, null);
    clearMastersCache();
    return cls;
  });
}
export async function saveRoute(actor: Actor, input: { id?: number; name: string; stops: string; monthlyFee: number; isActive: boolean }) {
  const db = getDb();
  if (input.id) {
    const [old] = await db.select().from(transportRoutes).where(eq(transportRoutes.id, input.id));
    await db.update(transportRoutes).set(input).where(eq(transportRoutes.id, input.id));
    await audit(db, actor, "update", "transport_route", input.id, old, input);
  } else {
    const [r] = await db.insert(transportRoutes).values(input).returning();
    await audit(db, actor, "create", "transport_route", r!.id, null, input);
  }
  clearMastersCache();
}

// ---------------------------------------------------------------- fee heads & structures
export async function createFeeHead(actor: Actor, input: unknown) {
  const d = feeHeadSchema.parse(input);
  const db = getDb();
  const [h] = await db.insert(feeHeads).values({ ...d, sortOrder: 50 }).onConflictDoNothing().returning();
  if (!h) throw new AppError("A fee head with this code exists", { code: "Already used" });
  await audit(db, actor, "create", "fee_head", h.id, null, d);
  clearMastersCache();
  return h;
}

/**
 * Choose which fee heads print as fixed rows on receipts and bills, in what order, and under what wording.
 * Heads left out are still printed (as extra rows) whenever they have an amount.
 */
export async function saveReceiptRows(actor: Actor, input: unknown) {
  const rows = receiptRowsSchema.parse(input);
  const db = getDb();
  await db.transaction(async (tx) => {
    const before = await tx.select({ id: feeHeads.id, order: feeHeads.receiptOrder, label: feeHeads.receiptLabel }).from(feeHeads);
    const old = new Map(before.map((b) => [b.id, b]));
    for (const r of rows) {
      if (!old.has(r.id)) continue;
      await tx.update(feeHeads).set({ receiptOrder: r.show ? r.order : null, receiptLabel: r.label || null }).where(eq(feeHeads.id, r.id));
    }
    await audit(tx, actor, "update", "fee_head", null, before, rows.map((r) => ({ id: r.id, order: r.show ? r.order : null, label: r.label || null })));
  });
  clearMastersCache();
}

export async function getOrCreateStructure(actor: Actor, academicYearId: number, classId: number) {
  const db = getDb();
  const [found] = await db.select().from(feeStructures).where(and(eq(feeStructures.academicYearId, academicYearId), eq(feeStructures.classId, classId)));
  if (found) return found;
  const [s] = await db.insert(feeStructures).values({ academicYearId, classId }).onConflictDoNothing().returning();
  if (s) await audit(db, actor, "create", "fee_structure", s.id, null, { academicYearId, classId });
  return s ?? (await db.select().from(feeStructures).where(and(eq(feeStructures.academicYearId, academicYearId), eq(feeStructures.classId, classId))))[0]!;
}

export async function structureItems(structureId: number) {
  return getDb().select({ item: feeStructureItems, head: feeHeads }).from(feeStructureItems)
    .innerJoin(feeHeads, eq(feeHeads.id, feeStructureItems.feeHeadId)).where(eq(feeStructureItems.structureId, structureId)).orderBy(asc(feeHeads.sortOrder));
}

export async function listStructures(academicYearId: number) {
  const db = getDb();
  const rows = await db.select({ s: feeStructures, className: classes.name, sortOrder: classes.sortOrder, item: feeStructureItems })
    .from(classes).leftJoin(feeStructures, and(eq(feeStructures.classId, classes.id), eq(feeStructures.academicYearId, academicYearId)))
    .leftJoin(feeStructureItems, eq(feeStructureItems.structureId, feeStructures.id)).orderBy(asc(classes.sortOrder));
  const out = new Map<string, { classId: number; className: string; structureId: number | null; monthly: number; annualTotal: number; items: number }>();
  const cls = await db.select().from(classes).orderBy(asc(classes.sortOrder));
  for (const c of cls) out.set(c.name, { classId: c.id, className: c.name, structureId: null, monthly: 0, annualTotal: 0, items: 0 });
  for (const r of rows) {
    const o = out.get(r.className)!;
    if (r.s) o.structureId = r.s.id;
    if (r.item) {
      o.items++;
      const times = r.item.applicableMonths?.length ?? { monthly: 12, quarterly: 4, half_yearly: 2, annual: 1, one_time: 1 }[r.item.frequency];
      o.annualTotal += r.item.amount * times;
      if (r.item.frequency === "monthly") o.monthly += r.item.amount;
    }
  }
  return [...out.values()];
}

export async function saveStructureItem(actor: Actor, input: unknown) {
  const d = structureItemSchema.parse(input);
  const db = getDb();
  const [old] = await db.select().from(feeStructureItems).where(and(eq(feeStructureItems.structureId, d.structureId), eq(feeStructureItems.feeHeadId, d.feeHeadId)));
  const [row] = await db.insert(feeStructureItems).values(d)
    .onConflictDoUpdate({ target: [feeStructureItems.structureId, feeStructureItems.feeHeadId], set: { amount: d.amount, frequency: d.frequency, dueDay: d.dueDay, applicableMonths: d.applicableMonths } })
    .returning();
  await audit(db, actor, old ? "update" : "create", "fee_structure_item", row!.id, old ?? null, d);
  return row!;
}

export async function removeStructureItem(actor: Actor, itemId: number) {
  const db = getDb();
  const [old] = await db.delete(feeStructureItems).where(eq(feeStructureItems.id, itemId)).returning();
  // Configuration, not a financial record: invoices already issued keep their own lines.
  await audit(db, actor, "delete", "fee_structure_item", itemId, old ?? null, null);
}

/** Copy every class's structure from one year to another with an optional % hike (rounded to whole rupees). */
export async function copyStructures(actor: Actor, fromYearId: number, toYearId: number, hikePercent: number) {
  if (fromYearId === toYearId) throw new AppError("Choose a different target year");
  const db = getDb();
  return db.transaction(async (tx) => {
    const src = await tx.select({ s: feeStructures, i: feeStructureItems }).from(feeStructures)
      .innerJoin(feeStructureItems, eq(feeStructureItems.structureId, feeStructures.id)).where(eq(feeStructures.academicYearId, fromYearId));
    let copied = 0;
    const bp = Math.round(hikePercent * 100);
    for (const r of src) {
      const [dst] = await tx.insert(feeStructures).values({ academicYearId: toYearId, classId: r.s.classId })
        .onConflictDoUpdate({ target: [feeStructures.academicYearId, feeStructures.classId], set: { classId: r.s.classId } }).returning();
      const raised = r.i.amount + percentOf(r.i.amount, bp);
      const amount = Math.round(raised / 100) * 100;
      const ins = await tx.insert(feeStructureItems).values({ structureId: dst!.id, feeHeadId: r.i.feeHeadId, amount, frequency: r.i.frequency, dueDay: r.i.dueDay, applicableMonths: r.i.applicableMonths })
        .onConflictDoNothing().returning();
      copied += ins.length;
    }
    await audit(tx, actor, "copy", "fee_structure", null, null, { fromYearId, toYearId, hikePercent, copied });
    return { copied };
  });
}

// ---------------------------------------------------------------- concessions
export async function createConcessionType(actor: Actor, input: unknown) {
  const d = concessionTypeSchema.parse(input);
  const db = getDb();
  const [t] = await db.insert(concessionTypes).values({ ...d, feeHeadId: d.feeHeadId ?? null }).onConflictDoNothing().returning();
  if (!t) throw new AppError("A concession with this name exists");
  await audit(db, actor, "create", "concession_type", t.id, null, d);
  return t;
}
export async function listConcessionTypes() {
  return getDb().select({ t: concessionTypes, headName: feeHeads.name }).from(concessionTypes).leftJoin(feeHeads, eq(feeHeads.id, concessionTypes.feeHeadId));
}

/** Attaching a concession needs ADMIN/ACCOUNTANT; it is approved by that user immediately. */
export async function grantConcession(actor: Actor, input: unknown) {
  const d = studentConcessionSchema.parse(input);
  if (actor.role !== "ADMIN" && actor.role !== "ACCOUNTANT") throw new AppError("Only an Accountant or Admin can approve concessions");
  if (!(await getSettings()).concessionsEnabled) throw new AppError("Concessions are turned off. An Admin can turn them on in Settings.");
  const db = getDb();
  const [st] = await db.select({ id: students.id }).from(students).where(eq(students.id, d.studentId));
  if (!st) throw new AppError("Student not found");
  const [c] = await db.insert(studentConcessions).values({ ...d, validTo: d.validTo ?? null, approvedBy: actor.id, approvedAt: new Date() }).returning();
  await audit(db, actor, "grant", "student_concession", c!.id, null, d);
  return c!;
}
export async function revokeConcession(actor: Actor, id: number) {
  const db = getDb();
  await db.update(studentConcessions).set({ isActive: false }).where(eq(studentConcessions.id, id));
  await audit(db, actor, "revoke", "student_concession", id);
}

// ---------------------------------------------------------------- late fees
export async function saveLateFeeRule(actor: Actor, input: unknown) {
  const d = lateFeeRuleSchema.parse(input);
  const db = getDb();
  const [old] = await db.select().from(lateFeeRules).where(eq(lateFeeRules.academicYearId, d.academicYearId));
  await db.insert(lateFeeRules).values(d).onConflictDoUpdate({ target: lateFeeRules.academicYearId, set: d });
  await audit(db, actor, old ? "update" : "create", "late_fee_rule", d.academicYearId, old ?? null, d);
}
export async function getLateFeeRule(academicYearId: number) {
  const [r] = await getDb().select().from(lateFeeRules).where(eq(lateFeeRules.academicYearId, academicYearId));
  return r ?? null;
}
