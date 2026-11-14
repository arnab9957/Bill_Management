import { and, asc, eq } from "drizzle-orm";
import {
  getDb, academicYears, classes, concessionTypes, feeHeads, feeStructureItems, feeStructures, lateFeeRules, sections,
  studentConcessions, transportRoutes, students,
} from "@sb/db";
import {
  concessionTypeSchema, feeHeadSchema, lateFeeRuleSchema, structureItemSchema, studentConcessionSchema, isoDate, z,
} from "@sb/validation";
import { AppError, audit, type Actor } from "../common";
import { percentOf } from "../money";

// ---------------------------------------------------------------- masters
export async function masters() {
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

const yearSchema = z.object({
  name: z.string().regex(/^\d{4}-\d{2}$/, "Use e.g. 2027-28"),
  startDate: isoDate,
  endDate: isoDate,
}).refine((d) => d.startDate < d.endDate, { message: "End must be after start", path: ["endDate"] });

export async function createYear(actor: Actor, input: unknown) {
  const d = yearSchema.parse(input);
  const db = getDb();
  const [y] = await db.insert(academicYears).values(d).returning();
  await audit(db, actor, "create", "academic_year", y!.id, null, d);
  return y!;
}
export async function setCurrentYear(actor: Actor, yearId: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(academicYears).set({ isCurrent: false }).where(eq(academicYears.isCurrent, true));
    await tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, yearId));
    await audit(tx, actor, "set_current", "academic_year", yearId);
  });
}
export async function createClass(actor: Actor, name: string, sortOrder: number) {
  const db = getDb();
  const [c] = await db.insert(classes).values({ name: z.string().trim().min(1).parse(name), sortOrder }).returning();
  await audit(db, actor, "create", "class", c!.id, null, { name });
  return c!;
}
export async function createSection(actor: Actor, classId: number, name: string) {
  const db = getDb();
  const [s] = await db.insert(sections).values({ classId, name: z.string().trim().min(1).parse(name).toUpperCase() }).onConflictDoNothing().returning();
  if (!s) throw new AppError("Section already exists");
  await audit(db, actor, "create", "section", s.id, null, { classId, name });
  return s;
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
}

// ---------------------------------------------------------------- fee heads & structures
export async function createFeeHead(actor: Actor, input: unknown) {
  const d = feeHeadSchema.parse(input);
  const db = getDb();
  const [h] = await db.insert(feeHeads).values({ ...d, sortOrder: 50 }).onConflictDoNothing().returning();
  if (!h) throw new AppError("A fee head with this code exists", { code: "Already used" });
  await audit(db, actor, "create", "fee_head", h.id, null, d);
  return h;
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
