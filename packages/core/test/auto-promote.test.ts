/**
 * One-click automatic promotion after a session ends, then fixing exceptions with Change.
 * Enabled with RUN_DB_TESTS=1 (needs `pnpm db:start`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_autopromote_test";
const run = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!run)("auto promotion", () => {
  let core: typeof import("../src"), db: typeof import("@sb/db");
  const admin = { id: 1, role: "ADMIN" as const, username: "admin", fullName: "Admin" };
  let y1: number;
  const cls: Record<string, number> = {};
  const st: Record<string, number> = {};
  let phone = 9822200000;
  const now = async (adm: string, yearName: string) => {
    const e = (await core.students.listEnrollments(st[adm]!)).find((x) => x.yearName === yearName);
    return e ? `${e.className}:${e.e.status}` : null;
  };

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
    const m = await core.fees.masters();
    for (const k of m.classes) cls[k.name] = k.id;
    y1 = m.years.find((y) => y.name === "2026-27")!.id;
    // Nursery runs January-December; everything else April-March.
    await core.sessions.saveClassSession(admin, { yearId: y1, classId: cls.Nursery!, startDate: "2026-01-01", endDate: "2026-12-31" });
    for (const [adm, c, sec, roll] of [["N1", "Nursery", "B", "7"], ["N2", "Nursery", "A", "8"], ["V1", "V", "A", "1"], ["X1", "XII", "A", "1"]] as const) {
      const secId = m.sections.find((s) => s.classId === cls[c] && s.name === sec)?.id;
      const s = await core.students.admitStudent(admin, {
        admissionNo: adm, name: `Student ${adm}`, classId: cls[c]!, sectionId: secId, rollNo: roll, admissionDate: "2025-06-01", academicYearId: y1,
        guardian: { name: "Parent", mobile: String(++phone), whatsappNo: String(phone), messagingConsent: "on" },
      });
      st[adm] = s.id;
    }
    await core.billing.generateInvoices({ period: "2026-04", dryRun: false }); // some unpaid dues to carry
  }, 180_000);

  it("before any session ends there is nothing to promote, and the page says which class ends next", async () => {
    const r = await core.students.autoPromoteReady(y1, "2026-11-20");
    expect(r.ready).toEqual([]);
    expect(r.nextEnd).toMatchObject({ className: "Nursery", endsOn: "2026-12-31" });
    expect(r).toMatchObject({ nextYearExists: false, nextYearName: "2027-28" });
  });

  it("after Nursery's session ends: one click creates 2027-28 from 2026-27 and promotes only Nursery", async () => {
    expect((await core.students.autoPromoteReady(y1, "2027-01-05")).ready.map((r) => r.className)).toEqual(["Nursery"]);
    const r = await core.students.autoPromote(admin, y1, "2027-01-05");
    expect(r.toYear).toMatchObject({ name: "2027-28", startDate: "2027-04-01", endDate: "2028-03-31" });
    expect(r.notes.join(" ")).toMatch(/Created academic year 2027-28/);
    expect(r.notes.join(" ")).toMatch(/Copied fees/);
    expect(r.notes.join(" ")).toMatch(/Nursery: session 2027-01-01 to 2027-12-31/);
    expect(r.done).toEqual([{ className: "Nursery", toName: "LKG", students: 2, carried: 2 }]);
    expect(r.waiting.map((w) => w.className).sort()).toEqual(["V", "XII"]);
    expect(await now("N1", "2027-28")).toBe("LKG:studying");
    expect(await now("V1", "2027-28")).toBeNull();
    // section and roll number kept
    const e = await core.students.enrollmentFor(st.N1!, r.toYear.id);
    const m = await core.fees.masters();
    expect([m.sections.find((s) => s.id === e!.sectionId)?.name, e!.rollNo]).toEqual(["B", "7"]);
    // the new year has fees for every class, copied at the same amounts
    expect((await core.students.promotionOverview(y1, r.toYear.id)).every((x) => x.targetHasFees)).toBe(true);
  });

  it("clicking again changes nothing", async () => {
    const r = await core.students.autoPromote(admin, y1, "2027-01-05");
    expect(r.done).toEqual([]);
    expect(r.notes).toEqual([]);
    expect((await core.fees.masters()).years.map((y) => y.name).sort()).toEqual(["2026-27", "2027-28"]);
  });

  it("Change fixes a student afterwards, even with carried dues: repeat, left, back to promoted", async () => {
    const y2 = (await core.fees.masters()).years.find((y) => y.name === "2027-28")!.id;
    expect((await core.students.changePromotion(admin, { studentId: st.N2!, fromYearId: y1, toYearId: y2, action: "repeat" })).now).toBe("Class Nursery");
    expect(await now("N2", "2027-28")).toBe("Nursery:studying");
    expect((await core.students.changePromotion(admin, { studentId: st.N2!, fromYearId: y1, toYearId: y2, action: "leave" })).now).toBe("Left school");
    expect((await db.getDb().select().from(db.students).where(db.dz.eq(db.students.id, st.N2!)))[0]!.status).toBe("left");
    expect((await core.students.changePromotion(admin, { studentId: st.N2!, fromYearId: y1, toYearId: y2, action: "promote" })).now).toBe("Class LKG");
    expect((await db.getDb().select().from(db.students).where(db.dz.eq(db.students.id, st.N2!)))[0]!.status).toBe("active");
    // carried dues are still there
    expect((await core.payments.counterView(st.N2!)).total).toBeGreaterThan(0);
  });

  it("after April: the rest are promoted, Class XII passes out, and Change is refused once bills exist", async () => {
    const r = await core.students.autoPromote(admin, y1, "2027-04-02");
    expect(r.done.map((d) => `${d.className}→${d.toName}`).sort()).toEqual(["V→VI", "XII→Passed out"]);
    expect(await now("V1", "2027-28")).toBe("VI:studying");
    expect(await now("X1", "2026-27")).toBe("XII:passed_out");
    expect((await core.students.autoPromoteReady(y1, "2027-04-02")).ready).toEqual([]);
    const y2 = (await core.fees.masters()).years.find((y) => y.name === "2027-28")!.id;
    await core.billing.generateInvoices({ period: "2027-04", dryRun: false });
    await expect(core.students.changePromotion(admin, { studentId: st.V1!, fromYearId: y1, toYearId: y2, action: "repeat" })).rejects.toThrow(/monthly bill/);
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
  });
});
