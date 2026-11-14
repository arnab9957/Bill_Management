import ExcelJS from "exceljs";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import {
  getDb, academicYears, classes, guardians, invoices, sections, studentConcessions, concessionTypes, studentGuardians, students,
  transportRoutes, notificationOutbox, payments, type Executor,
} from "@sb/db";
import { admissionSchema, guardianSchema, importRowSchema, studentSchema, fieldErrors, type ImportRow } from "@sb/validation";
import { AppError, audit, getCurrentYear, type Actor } from "../common";
import { today, type ISODate } from "../dates";
import { createOpeningBalance } from "../billing";
import { recalcWallet } from "../payments/wallet";

export async function admitStudent(actor: Actor, input: unknown) {
  const d = admissionSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const dup = await tx.select({ id: students.id }).from(students).where(eq(students.admissionNo, d.admissionNo));
    if (dup.length) throw new AppError("Admission number already exists", { admissionNo: "Already used" });
    const [s] = await tx.insert(students).values({
      admissionNo: d.admissionNo, name: d.name, dob: d.dob ?? null, gender: d.gender ?? null, classId: d.classId,
      sectionId: d.sectionId ?? null, rollNo: d.rollNo || null, admissionDate: d.admissionDate, transportRouteId: d.transportRouteId ?? null,
    }).returning();
    let guardianId = d.existingGuardianId;
    if (!guardianId && d.guardian) {
      const [g] = await tx.insert(guardians).values({ ...d.guardian, whatsappNo: d.guardian.whatsappNo ?? null, email: d.guardian.email ?? null }).returning();
      guardianId = g!.id;
      await audit(tx, actor, "create", "guardian", g!.id, null, d.guardian);
    }
    await tx.insert(studentGuardians).values({ studentId: s!.id, guardianId: guardianId!, isPrimary: true });
    await audit(tx, actor, "create", "student", s!.id, null, { ...d, guardian: undefined, guardianId });
    return s!;
  });
}

export async function updateStudent(actor: Actor, studentId: number, input: unknown) {
  const d = studentSchema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [old] = await tx.select().from(students).where(eq(students.id, studentId)).for("update");
    if (!old) throw new AppError("Student not found");
    if (d.admissionNo !== old.admissionNo) {
      const dup = await tx.select({ id: students.id }).from(students).where(eq(students.admissionNo, d.admissionNo));
      if (dup.length) throw new AppError("Admission number already exists", { admissionNo: "Already used" });
    }
    const [s] = await tx.update(students).set({
      admissionNo: d.admissionNo, name: d.name, dob: d.dob ?? null, gender: d.gender ?? null, classId: d.classId,
      sectionId: d.sectionId ?? null, rollNo: d.rollNo || null, admissionDate: d.admissionDate, transportRouteId: d.transportRouteId ?? null,
    }).where(eq(students.id, studentId)).returning();
    await audit(tx, actor, "update", "student", studentId, old, s);
    return s!;
  });
}

export async function updateGuardian(actor: Actor, guardianId: number, input: unknown) {
  const d = guardianSchema.parse(input);
  const db = getDb();
  const [old] = await db.select().from(guardians).where(eq(guardians.id, guardianId));
  if (!old) throw new AppError("Guardian not found");
  const [g] = await db.update(guardians).set({ ...d, whatsappNo: d.whatsappNo ?? null, email: d.email ?? null }).where(eq(guardians.id, guardianId)).returning();
  await audit(db, actor, "update", "guardian", guardianId, old, g);
  return g!;
}

/** active → left (stops future billing) → alumni. Never deleted. */
export async function setStudentStatus(actor: Actor, studentId: number, status: "active" | "left" | "alumni", leavingDate?: ISODate) {
  const db = getDb();
  const [old] = await db.select().from(students).where(eq(students.id, studentId));
  if (!old) throw new AppError("Student not found");
  await db.update(students).set({ status, leavingDate: status === "active" ? null : leavingDate ?? today() }).where(eq(students.id, studentId));
  await audit(db, actor, "status", "student", studentId, { status: old.status }, { status, leavingDate });
}

export async function searchStudents(q: string, opts: { classId?: number; status?: string; limit?: number } = {}) {
  const db = getDb();
  const conds = [];
  const term = q.trim();
  if (term) {
    conds.push(or(
      ilike(students.name, `%${term}%`),
      ilike(students.admissionNo, `${term}%`),
      sql`exists (select 1 from ${studentGuardians} sg join ${guardians} g on g.id = sg.guardian_id where sg.student_id = ${students.id} and (g.mobile like ${term + "%"} or g.name ilike ${"%" + term + "%"}))`,
    ));
  }
  if (opts.classId) conds.push(eq(students.classId, opts.classId));
  if (opts.status) conds.push(eq(students.status, opts.status as "active"));
  return db.select({
    id: students.id, admissionNo: students.admissionNo, name: students.name, status: students.status, rollNo: students.rollNo,
    className: classes.name, sectionName: sections.name,
    outstanding: sql<number>`(select coalesce(sum(balance),0) from ${invoices} i where i.student_id = ${students.id} and i.status <> 'cancelled')`.mapWith(Number),
  }).from(students).innerJoin(classes, eq(classes.id, students.classId)).leftJoin(sections, eq(sections.id, students.sectionId))
    .where(conds.length ? and(...conds) : undefined).orderBy(asc(classes.sortOrder), asc(sections.name), asc(students.name)).limit(opts.limit ?? 300);
}

export async function getStudentProfile(studentId: number) {
  const db = getDb();
  const [row] = await db.select({ s: students, className: classes.name, sectionName: sections.name, route: transportRoutes.name })
    .from(students).innerJoin(classes, eq(classes.id, students.classId)).leftJoin(sections, eq(sections.id, students.sectionId))
    .leftJoin(transportRoutes, eq(transportRoutes.id, students.transportRouteId)).where(eq(students.id, studentId));
  if (!row) return null;
  const gs = await db.select({ g: guardians, isPrimary: studentGuardians.isPrimary }).from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId)).where(eq(studentGuardians.studentId, studentId));
  const siblings = gs.length ? await db.select({ id: students.id, name: students.name, admissionNo: students.admissionNo, className: classes.name })
    .from(studentGuardians).innerJoin(students, eq(students.id, studentGuardians.studentId)).innerJoin(classes, eq(classes.id, students.classId))
    .where(and(inArray(studentGuardians.guardianId, gs.map((g) => g.g.id)), ne(students.id, studentId))) : [];
  const concessions = await db.select({ c: studentConcessions, t: concessionTypes }).from(studentConcessions)
    .innerJoin(concessionTypes, eq(concessionTypes.id, studentConcessions.concessionTypeId)).where(eq(studentConcessions.studentId, studentId));
  const messages = await db.select().from(notificationOutbox)
    .where(sql`${notificationOutbox.studentIds} @> ${JSON.stringify([studentId])}::jsonb`).orderBy(desc(notificationOutbox.id)).limit(50);
  return { ...row, guardians: gs, siblings, concessions, messages };
}

/** Full statement: bills, payments, concessions, late fees, credit notes — chronological with running balance. */
export async function studentLedger(studentId: number) {
  const db = getDb();
  const invs = await db.select().from(invoices).where(eq(invoices.studentId, studentId)).orderBy(asc(invoices.issueDate), asc(invoices.id));
  const pays = await db.select().from(payments).where(eq(payments.studentId, studentId)).orderBy(asc(payments.date), asc(payments.id));
  type Entry = { date: string; kind: string; ref: string; description: string; debit: number; credit: number; refId: number };
  const entries: Entry[] = [];
  for (const i of invs) {
    entries.push({ date: i.issueDate, kind: "invoice", ref: i.invoiceNo, refId: i.id, description: `Bill ${i.period}${i.discount ? " (after concession)" : ""}${i.status === "cancelled" ? " – CANCELLED" : ""}`, debit: i.gross + i.lateFee - i.discount, credit: 0 });
    if (i.credited) entries.push({ date: i.issueDate, kind: "credit", ref: i.invoiceNo, refId: i.id, description: "Credit note", debit: 0, credit: i.credited });
    if (i.status === "cancelled") entries.push({ date: i.issueDate, kind: "credit", ref: i.invoiceNo, refId: i.id, description: "Bill cancelled", debit: 0, credit: i.net - i.paid });
  }
  for (const p of pays) {
    entries.push({ date: p.date, kind: "payment", ref: p.receiptNo, refId: p.id, description: `Payment (${p.mode})`, debit: 0, credit: p.amount });
    if (p.status === "cancelled") entries.push({ date: p.date, kind: "reversal", ref: p.receiptNo, refId: p.id, description: `Receipt cancelled: ${p.cancelReason ?? ""}`, debit: p.amount, credit: 0 });
  }
  entries.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  let running = 0;
  const withBalance = entries.map((e) => ({ ...e, balance: (running += e.debit - e.credit) }));
  const wallet = await recalcWallet(db, studentId);
  return { entries: withBalance, invoices: invs, payments: pays, wallet };
}

// ---------------------------------------------------------------- Excel import
export const IMPORT_COLUMNS: { key: keyof ImportRow; header: string; note: string }[] = [
  { key: "admissionNo", header: "Admission No", note: "Unique" },
  { key: "name", header: "Student Name", note: "" },
  { key: "className", header: "Class", note: "Exactly as in Settings (e.g. V)" },
  { key: "section", header: "Section", note: "A, B…" },
  { key: "rollNo", header: "Roll No", note: "" },
  { key: "dob", header: "DOB", note: "YYYY-MM-DD" },
  { key: "gender", header: "Gender", note: "M / F / O" },
  { key: "admissionDate", header: "Admission Date", note: "YYYY-MM-DD" },
  { key: "guardianName", header: "Guardian Name", note: "" },
  { key: "guardianMobile", header: "Guardian Mobile", note: "10 digits" },
  { key: "guardianEmail", header: "Guardian Email", note: "" },
  { key: "guardianWhatsapp", header: "Guardian WhatsApp", note: "If different" },
  { key: "openingBalance", header: "Opening Balance", note: "Old dues in rupees" },
];

export async function importTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 18 }));
  ws.addRow({ admissionNo: "A2001", name: "Sample Student", className: "V", section: "A", rollNo: "1", dob: "2015-06-15", gender: "F", admissionDate: "2026-04-01", guardianName: "Sample Parent", guardianMobile: "9876543210", guardianEmail: "parent@example.com", openingBalance: "0" });
  ws.getRow(1).font = { bold: true };
  const notes = wb.addWorksheet("Instructions");
  IMPORT_COLUMNS.forEach((c) => notes.addRow([c.header, c.note]));
  notes.addRow([]);
  notes.addRow(["Siblings: give the same Guardian Mobile; they will share one guardian record."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const cellText = (v: ExcelJS.CellValue): unknown => {
  if (v == null) return undefined;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return v.result;
  return v;
};

export interface ImportPreviewRow { row: number; data?: ImportRow; errors: Record<string, string> }

/** Parse and validate every row. Nothing is saved. */
export async function previewImport(file: ArrayBuffer): Promise<{ rows: ImportPreviewRow[]; valid: number; invalid: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError("The file has no worksheet");
  const headerRow = ws.getRow(1);
  const colIndex = new Map<keyof ImportRow, number>();
  headerRow.eachCell((cell, col) => {
    const h = String(cellText(cell.value) ?? "").trim().toLowerCase();
    const c = IMPORT_COLUMNS.find((x) => x.header.toLowerCase() === h);
    if (c) colIndex.set(c.key, col);
  });
  const missing = IMPORT_COLUMNS.filter((c) => ["admissionNo", "name", "className", "admissionDate", "guardianName", "guardianMobile"].includes(c.key) && !colIndex.has(c.key));
  if (missing.length) throw new AppError(`Missing columns: ${missing.map((m) => m.header).join(", ")}. Download the template.`);

  const db = getDb();
  const cls = await db.select().from(classes);
  const secs = await db.select().from(sections);
  const existingAdm = new Set((await db.select({ a: students.admissionNo }).from(students)).map((r) => r.a));
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const raw: Record<string, unknown> = {};
    for (const [k, col] of colIndex) raw[k] = cellText(r.getCell(col).value);
    if (Object.values(raw).every((v) => v == null || v === "")) return;
    const parsed = importRowSchema.safeParse(raw);
    const errors = parsed.success ? {} : fieldErrors(parsed.error);
    if (parsed.success) {
      const d = parsed.data;
      const c = cls.find((x) => x.name.toLowerCase() === d.className.toLowerCase());
      if (!c) errors.className = `Unknown class "${d.className}"`;
      else if (d.section && !secs.some((s) => s.classId === c.id && s.name.toLowerCase() === d.section!.toLowerCase())) errors.section = `Unknown section "${d.section}" for ${c.name}`;
      if (existingAdm.has(d.admissionNo)) errors.admissionNo = "Admission no. already exists";
      if (seen.has(d.admissionNo)) errors.admissionNo = "Duplicate admission no. in file";
      seen.add(d.admissionNo);
    }
    rows.push({ row: n, data: parsed.success ? parsed.data : undefined, errors });
  });
  const invalid = rows.filter((r) => Object.keys(r.errors).length).length;
  return { rows, valid: rows.length - invalid, invalid };
}

/** Save all rows, or none: a single bad row aborts the import. */
export async function commitImport(actor: Actor, file: ArrayBuffer) {
  const preview = await previewImport(file);
  if (preview.invalid) throw new AppError(`${preview.invalid} row(s) have errors. Fix them and upload again.`);
  const db = getDb();
  const year = await getCurrentYear(db);
  return db.transaction(async (tx) => {
    const cls = await tx.select().from(classes);
    const secs = await tx.select().from(sections);
    const guardianByMobile = new Map<string, number>();
    for (const g of await tx.select({ id: guardians.id, mobile: guardians.mobile }).from(guardians)) guardianByMobile.set(g.mobile, g.id);
    let count = 0;
    for (const { data: d } of preview.rows) {
      if (!d) continue;
      const c = cls.find((x) => x.name.toLowerCase() === d.className.toLowerCase())!;
      const sec = d.section ? secs.find((s) => s.classId === c.id && s.name.toLowerCase() === d.section!.toLowerCase()) : undefined;
      const [s] = await tx.insert(students).values({
        admissionNo: d.admissionNo, name: d.name, dob: d.dob ?? null, gender: d.gender ?? null, classId: c.id, sectionId: sec?.id ?? null,
        rollNo: d.rollNo ?? null, admissionDate: d.admissionDate,
      }).returning();
      let gid = guardianByMobile.get(d.guardianMobile);
      if (!gid) {
        const [g] = await tx.insert(guardians).values({
          name: d.guardianName, mobile: d.guardianMobile, whatsappNo: d.guardianWhatsapp ?? null, email: d.guardianEmail ?? null,
          messagingConsent: true, // consent collected on the school's admission form
        }).returning();
        gid = g!.id;
        guardianByMobile.set(d.guardianMobile, gid);
      }
      await tx.insert(studentGuardians).values({ studentId: s!.id, guardianId: gid, isPrimary: true }).onConflictDoNothing();
      if (d.openingBalance > 0) await createOpeningBalance(tx, actor, s!.id, d.openingBalance, year.id, year.name, today());
      count++;
    }
    await audit(tx, actor, "import", "student", null, null, { count });
    return { count };
  });
}

// ---------------------------------------------------------------- promotion
/**
 * Year-end promotion: move every active student of `fromClassId` to `toClassId`
 * (or mark alumni) and carry their unpaid dues into the new year as an opening balance.
 * The caller must take a backup first.
 */
export async function promoteClass(actor: Actor, args: { fromClassId: number; toClassId: number | "alumni"; newYearId: number }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [ny] = await tx.select().from(academicYears).where(eq(academicYears.id, args.newYearId));
    if (!ny) throw new AppError("Target academic year not found");
    const list = await tx.select().from(students).where(and(eq(students.classId, args.fromClassId), eq(students.status, "active"))).for("update");
    let moved = 0, carried = 0;
    for (const s of list) {
      const due = await outstandingBefore(tx, s.id, ny.id);
      if (due > 0) {
        const exists = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.studentId, s.id), eq(invoices.academicYearId, ny.id), eq(invoices.period, "OPENING")));
        if (!exists.length) {
          // Close old invoices by credit and re-bill the total in the new year so the ledger stays continuous.
          const old = await tx.select().from(invoices).where(and(eq(invoices.studentId, s.id), ne(invoices.academicYearId, ny.id), sql`${invoices.balance} > 0`, ne(invoices.status, "cancelled")));
          for (const i of old) {
            await tx.execute(sql`update invoice_line set credited = credited + (net - paid), net = paid where invoice_id = ${i.id} and net > paid`);
            await tx.update(invoices).set({ credited: i.credited + i.balance, net: i.paid, balance: 0, status: "paid", cancelReason: `Carried forward to ${ny.name}` }).where(eq(invoices.id, i.id));
          }
          await createOpeningBalance(tx, actor, s.id, due, ny.id, ny.name, ny.startDate, `Dues carried forward from previous year`);
          carried++;
        }
      }
      if (args.toClassId === "alumni") await tx.update(students).set({ status: "alumni", leavingDate: today() }).where(eq(students.id, s.id));
      else await tx.update(students).set({ classId: args.toClassId, sectionId: null }).where(eq(students.id, s.id));
      moved++;
    }
    await audit(tx, actor, "promote", "class", args.fromClassId, null, { to: args.toClassId, year: ny.name, moved, carried });
    return { moved, carried };
  });
}

async function outstandingBefore(tx: Executor, studentId: number, newYearId: number) {
  const [r] = await tx.select({ v: sql<string>`coalesce(sum(${invoices.balance}),0)` }).from(invoices)
    .where(and(eq(invoices.studentId, studentId), ne(invoices.academicYearId, newYearId), ne(invoices.status, "cancelled")));
  return Number(r?.v ?? 0);
}

export async function linkGuardian(actor: Actor, studentId: number, guardianId: number) {
  const db = getDb();
  await db.insert(studentGuardians).values({ studentId, guardianId, isPrimary: false }).onConflictDoNothing();
  await audit(db, actor, "link_guardian", "student", studentId, null, { guardianId });
}
