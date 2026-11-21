/**
 * Class sessions (different dates per class) and the promotion page, on a throw-away database.
 * Enabled with RUN_DB_TESTS=1 (needs `pnpm db:start`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_sessions_test";
const run = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!run)("class sessions and promotion", () => {
  let core: typeof import("../src"), db: typeof import("@sb/db");
  const admin = { id: 1, role: "ADMIN" as const, username: "admin", fullName: "Admin" };
  let cashier: { id: number; role: "CASHIER"; username: string; fullName: string };
  let y1: number, y2: number;
  const cls: Record<string, number> = {};
  const st: Record<string, number> = {};
  let phone = 9811100000;

  async function admit(adm: string, className: string, roll: string, section?: string) {
    const m = await core.fees.masters();
    const c = m.classes.find((x) => x.name === className)!;
    const sec = section ? m.sections.find((x) => x.classId === c.id && x.name === section)?.id : undefined;
    const s = await core.students.admitStudent(admin, {
      admissionNo: adm, name: `Student ${adm}`, classId: c.id, sectionId: sec, rollNo: roll, admissionDate: "2025-01-01", academicYearId: y1,
      guardian: { name: "Parent", mobile: String(++phone), messagingConsent: "on" },
    });
    st[adm] = s.id;
  }
  const save = (yearId: number, className: string, startDate: string | null, endDate: string | null) =>
    core.sessions.saveClassSession(admin, { yearId, classId: cls[className]!, startDate, endDate });
  const bills = async (adm: string) => (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, st[adm]!)))
    .filter((b) => /^\d{4}-\d{2}$/.test(b.period)).sort((a, b) => a.period.localeCompare(b.period));

  beforeAll(async () => {
    const c = new pg.Client({ connectionString: `${BASE}/postgres` });
    await c.connect();
    await c.query(`drop database if exists ${TEST_DB} with (force)`);
    await c.query(`create database ${TEST_DB}`);
    await c.end();
    const url = `${BASE}/${TEST_DB}`;
    const env = { ...process.env, DATABASE_URL: url };
    const dbDir = resolve(__dirname, "../../db");
    execFileSync(process.execPath, ["--import", "tsx", "src/migrate.ts"], { cwd: dbDir, env, stdio: "inherit" });
    execFileSync(process.execPath, ["--import", "tsx", "src/seed.ts", "--demo"], { cwd: dbDir, env, stdio: "inherit" });
    process.env.DATABASE_URL = url;
    process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-123";
    core = await import("../src");
    db = await import("@sb/db");
    const u = await core.accounts.createUser(admin, { username: "cash1", fullName: "Cashier", role: "CASHIER", password: "password123" });
    cashier = { id: u.id, role: "CASHIER", username: "cash1", fullName: "Cashier" };
    const m = await core.fees.masters();
    for (const k of m.classes) cls[k.name] = k.id;
    y1 = m.years.find((y) => y.name === "2026-27")!.id;
    y2 = (await core.fees.createYear(admin, { name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31" })).id;
    await core.fees.copyStructures(admin, y1, y2, 10);
    await admit("N1", "Nursery", "1", "A");
    await admit("N2", "Nursery", "2", "A");
    await admit("N3", "Nursery", "3", "B");
    await admit("N4", "Nursery", "4", "B");
    await admit("V1", "V", "1", "A");
    await admit("X1", "XII", "1", "A");
  }, 180_000);

  it("academic years: at most 12 months, name matches the start year, no overlap, no duplicate", async () => {
    const add = (name: string, startDate: string, endDate: string) => core.fees.createYear(admin, { name, startDate, endDate });
    await expect(add("2028-29", "2028-04-01", "2029-06-30")).rejects.toThrow(/at most 12 months/);
    await expect(add("2028-29", "2030-04-01", "2031-03-31")).rejects.toThrow(/must match the start year/);
    await expect(add("2028-29", "2028-04-01", "2028-03-01")).rejects.toThrow(/after start/);
    await expect(add("2026-27", "2026-04-01", "2027-03-31")).rejects.toThrow(/overlap/);
    await expect(add("2027-28", "2027-06-01", "2028-03-31")).rejects.toThrow(/overlap/);
  });

  it("leaving date: not before admission, not in the future", async () => {
    await expect(core.students.setStudentStatus(admin, st.V1!, "left", "2024-12-31")).rejects.toThrow(/before the admission date/);
    await expect(core.students.setStudentStatus(admin, st.V1!, "left", "2099-01-01")).rejects.toThrow(/future/);
  });

  it("a class without its own dates uses the academic year's dates", async () => {
    const s = await core.sessions.sessionOf(db.getDb(), y1, cls.V!);
    expect(s).toMatchObject({ startDate: "2026-04-01", endDate: "2027-03-31", custom: false });
  });

  it("session dates are checked: end after start, at most 12 months, no overlap with the class's other sessions", async () => {
    await expect(save(y1, "Nursery", "2026-12-31", "2026-01-01")).rejects.toThrow(/end after it starts/);
    await expect(save(y1, "Nursery", "2026-01-01", "2027-01-31")).rejects.toThrow(/at most 12 months/);
    // 2027-28 Nursery still uses the year's dates (from April 2027): June 2026-May 2027 would overlap it.
    await expect(save(y1, "Nursery", "2026-06-01", "2027-05-31")).rejects.toThrow(/cannot overlap/);
    expect(await save(y1, "Nursery", "2026-01-01", "2026-12-31")).toMatchObject({ startDate: "2026-01-01" });
    expect(await save(y2, "Nursery", "2027-01-01", "2027-12-31")).toMatchObject({ startDate: "2027-01-01" });
    // LKG next year can only start in January 2027 once LKG this year ends in December 2026.
    await expect(save(y2, "LKG", "2027-01-01", "2027-12-31")).rejects.toThrow(/LKG already has a session in 2026-27/);
    await save(y1, "LKG", "2026-01-01", "2026-12-31");
    expect(await save(y2, "LKG", "2027-01-01", "2027-12-31")).toMatchObject({ startDate: "2027-01-01" });
    // VI next year may not start in March 2027 while VI this year runs to March 2027.
    await expect(save(y2, "VI", "2027-03-01", "2028-02-28")).rejects.toThrow(/cannot overlap/);
  });

  it("bills follow each class's own session: Nursery stops after December, Class V runs to March", async () => {
    const dec = await core.billing.generateInvoices({ period: "2026-12", dryRun: true });
    // A1001/A1002 are the demo seed's two Class V students.
    expect(dec.planned.map((p) => p.admissionNo).sort()).toEqual(["A1001", "A1002", "N1", "N2", "N3", "N4", "V1", "X1"]);
    const jan = await core.billing.generateInvoices({ period: "2027-01", dryRun: true });
    expect(jan.planned.map((p) => p.admissionNo).sort()).toEqual(["A1001", "A1002", "V1", "X1"]); // Nursery's 2026-27 session ended in December
  });

  it("yearly fees go on the first bill of the student's session, and half-yearly fees count from the session start", async () => {
    for (const p of ["2026-04", "2026-05", "2026-06", "2026-07"]) await core.billing.generateInvoices({ period: p, dryRun: false });
    const heads = async (adm: string, period: string) => {
      const b = (await bills(adm)).find((x) => x.period === period)!;
      return (await db.getDb().select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.invoiceId, b.id))).map((l) => l.description.split(" – ")[0]).sort();
    };
    expect(await heads("V1", "2026-04")).toEqual(["Annual Charges", "Examination Fee", "Tuition Fee"]);
    // Nursery's session began in January: April is month 4, so the exam fee (every 6 months) is not due; July is month 7 → due.
    expect(await heads("N1", "2026-04")).toEqual(["Annual Charges", "Tuition Fee"]); // first bill made in this system gets the annual fee
    expect(await heads("N1", "2026-07")).toEqual(["Examination Fee", "Tuition Fee"]);
  });

  it("session dates cannot be moved so that existing bills fall outside them", async () => {
    await expect(save(y1, "V", "2026-05-01", "2027-03-31")).rejects.toThrow(/Bills already exist for 2026-04/);
    // Going back to the year's dates is fine for Class V (no change), and a class with no bills can move freely.
    await expect(save(y1, "XI", "2026-06-01", "2027-03-31")).resolves.toBeTruthy();
    await expect(save(y1, "XI", null, null)).resolves.toBeTruthy();
    expect((await core.sessions.sessionOf(db.getDb(), y1, cls.XI!)).custom).toBe(false);
  });

  it("promotion page overview: next class by class order, XII passes out, missing fees flagged", async () => {
    const o = await core.students.promotionOverview(y1, y2);
    const n = o.find((r) => r.className === "Nursery")!;
    expect(n).toMatchObject({ waiting: 4, defaultToName: "LKG", targetHasFees: true });
    expect(n.toSession).toMatchObject({ startDate: "2027-01-01" });
    expect(o.find((r) => r.className === "XII")!.defaultToName).toBe("Passed out");
    await expect(core.students.promoteStudents(admin, { fromYearId: y2, toYearId: y1, classId: cls.V!, toClassId: cls.VI!, rollMode: "keep", decisions: [] }))
      .rejects.toThrow(/starts before/);
  });

  it("promote a class with a choice per student: promote, repeat (failed), leave, not now; roll numbers cleared", async () => {
    const r = await core.students.promoteStudents(admin, {
      fromYearId: y1, toYearId: y2, classId: cls.Nursery!, toClassId: cls.LKG!, rollMode: "clear",
      decisions: [{ studentId: st.N1!, action: "promote" }, { studentId: st.N2!, action: "repeat" }, { studentId: st.N3!, action: "leave" }, { studentId: st.N4!, action: "skip" }],
    });
    expect(r).toMatchObject({ promoted: 1, repeated: 1, left: 1, skipped: 1 });
    const list = await core.students.promotionList(y1, cls.Nursery!, y2);
    expect(list.find((x) => x.admissionNo === "N1")!.movedTo).toBe("LKG");
    expect(list.find((x) => x.admissionNo === "N2")!.movedTo).toBe("Nursery");
    expect(list.find((x) => x.admissionNo === "N3")!.status).toBe("left");
    expect(list.find((x) => x.admissionNo === "N4")!.canPromote).toBe(true);
    const e1 = await core.students.enrollmentFor(st.N1!, y2);
    expect(e1).toMatchObject({ rollNo: null, status: "studying" });
    // same section name kept in the new class
    const m = await core.fees.masters();
    expect(m.sections.find((s) => s.id === e1!.sectionId)?.name).toBe("A");
    // Doing it again skips them instead of making a second record.
    const again = await core.students.promoteStudents(admin, { fromYearId: y1, toYearId: y2, classId: cls.Nursery!, toClassId: cls.LKG!, rollMode: "keep", decisions: [{ studentId: st.N1!, action: "promote" }] });
    expect(again.skipped).toBe(1);
  });

  it("unpaid dues are carried into the new session; a promoted student is billed by the new class's session", async () => {
    const carried = (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, st.N1!))).find((b) => b.period === "OPENING");
    expect(carried?.academicYearId).toBe(y2);
    // January 2027 is in LKG's 2027-28 session (Jan-Dec 2027) even though the calendar year is still 2026-27.
    const jan = await core.billing.generateInvoices({ period: "2027-01", dryRun: false });
    const n1 = jan.planned.find((p) => p.admissionNo === "N1")!;
    expect(n1).toMatchObject({ className: "LKG", yearName: "2027-28" });
    expect(jan.planned.find((p) => p.admissionNo === "N2")).toMatchObject({ className: "Nursery", yearName: "2027-28" });
    expect(jan.planned.find((p) => p.admissionNo === "N3")).toBeUndefined(); // left
    expect(jan.planned.find((p) => p.admissionNo === "N4")).toBeUndefined(); // not promoted yet, old session ended
    expect(jan.planned.find((p) => p.admissionNo === "V1")).toMatchObject({ className: "V", yearName: "2026-27" });
  });

  it("a payment belongs to the year of the student's session, not the calendar", async () => {
    const owed = (await core.payments.counterView(st.N1!)).total;
    const pay = await core.payments.collectPayment({ studentId: st.N1!, amount: owed, mode: "cash", date: "2027-01-12" }, cashier);
    const [p] = await db.getDb().select().from(db.payments).where(db.dz.eq(db.payments.id, pay.paymentId));
    expect(p!.academicYearId).toBe(y2);
    const v = await core.payments.collectPayment({ studentId: st.V1!, amount: 10000, mode: "cash", date: "2027-01-12" }, cashier);
    const [pv] = await db.getDb().select().from(db.payments).where(db.dz.eq(db.payments.id, v.paymentId));
    expect(pv!.academicYearId).toBe(y1);
  });

  it("undo: allowed while nothing happened in the new year, refused once dues were carried or bills made", async () => {
    // N2 (repeat) has carried dues → refused
    await expect(core.students.undoPromotion(admin, st.N2!, y2)).rejects.toThrow(/carried into/);
    // A student with no dues and no new bills can be undone.
    await admit("V2", "V", "2");
    await core.students.promoteStudents(admin, { fromYearId: y1, toYearId: y2, classId: cls.V!, toClassId: cls.VI!, rollMode: "keep", decisions: [{ studentId: st.V2!, action: "promote" }] });
    expect((await core.students.enrollmentFor(st.V2!, y2))?.classId).toBe(cls.VI);
    await core.students.undoPromotion(admin, st.V2!, y2);
    expect(await core.students.enrollmentFor(st.V2!, y2)).toBeNull();
    expect((await core.students.enrollmentFor(st.V2!, y1))?.status).toBe("studying");
    // Left at promotion can be brought back.
    await core.students.undoPromotion(admin, st.N3!, y2);
    expect((await core.students.enrollmentFor(st.N3!, y1))?.status).toBe("studying");
  });

  it("highest class passes out; dues stay collectable; passing out can be undone", async () => {
    const owedBefore = (await core.payments.counterView(st.X1!)).total;
    const r = await core.students.promoteStudents(admin, { fromYearId: y1, toYearId: y2, classId: cls.XII!, toClassId: "alumni", rollMode: "keep", decisions: [{ studentId: st.X1!, action: "promote" }] });
    expect(r.passedOut).toBe(1);
    const [s] = await db.getDb().select().from(db.students).where(db.dz.eq(db.students.id, st.X1!));
    expect(s!.status).toBe("alumni");
    expect((await core.payments.counterView(st.X1!)).total).toBe(owedBefore);
    const feb = await core.billing.generateInvoices({ period: "2027-02", studentId: st.X1!, dryRun: true });
    expect(feb.planned).toHaveLength(0); // no more bills
    await core.students.undoPromotion(admin, st.X1!, y2);
    expect((await db.getDb().select().from(db.students).where(db.dz.eq(db.students.id, st.X1!)))[0]!.status).toBe("active");
  });

  it("never the same month twice, and the books stay clean", async () => {
    for (const p of ["2027-01", "2027-02"]) await core.billing.generateInvoices({ period: p, dryRun: false });
    const all = await db.getDb().select().from(db.invoices);
    const keys = all.filter((b) => b.status !== "cancelled" && /^\d{4}-\d{2}$/.test(b.period)).map((b) => `${b.studentId}:${b.period}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
  });
});
