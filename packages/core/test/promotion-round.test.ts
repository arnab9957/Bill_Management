/**
 * The test school's 50 students go through a year-end promotion round (daily job on 2 April 2027),
 * then failed / left / mistaken cases are fixed as on the profile. Enabled with RUN_DB_TESTS=1.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_round_test";
const run = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!run)("year-end promotion round on the test school", () => {
  let core: typeof import("../src"), db: typeof import("@sb/db");
  let ids: Record<string, number>;
  let R: Awaited<ReturnType<typeof import("../scenarios/promotion-round")["promotionRound"]>>;
  const now = async (adm: string, y = "2027-28") => {
    const e = (await core.students.listEnrollments(ids[adm]!)).find((x) => x.yearName === y);
    return e ? `${e.className}:${e.e.status}` : null;
  };
  const status = async (adm: string) => (await db.getDb().select().from(db.students).where(db.dz.eq(db.students.id, ids[adm]!)))[0]!.status;
  const bills = async (adm: string, period: string) => (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, ids[adm]!)))
    .filter((i) => i.period === period && i.status !== "cancelled");

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
    ids = (await (await import("../scenarios/scenarios")).loadScenarios()).ids;
    R = await (await import("../scenarios/promotion-round")).promotionRound(ids);
  }, 600_000);

  it("nothing happens while sessions are running; on 2 April 2027 every class moves up into a new 2027-28", async () => {
    expect(R.checkedEarly).toBe(true);
    expect(R.promoted.map((p) => `${p.from}→${p.to}`)).toEqual(["2026-27→2027-28"]);
    expect(R.promoted[0]!.done.find((d) => d.className === "XII")!.toName).toBe("Passed out");
    expect(await now("S2001")).toBe("LKG:studying"); // Nursery → LKG
    expect(await now("S2013")).toBe("XII:studying"); // XI → XII
  });

  it("Class XII students pass out: no new session, no more bills, their dues still collectable", async () => {
    expect(await now("S2014")).toBeNull();
    expect(await status("S2014")).toBe("alumni");
    const owedBefore = (await core.payments.counterView(ids.S2027!)).total; // XII, pays half
    expect(owedBefore).toBeGreaterThan(0);
    expect(await bills("S2027", "2027-04")).toHaveLength(0);
  });

  it("students who left during the year are not promoted", async () => {
    expect(await now("S2044")).toBeNull();
    expect(await now("S2045")).toBeNull();
  });

  it("corrections on the profile: failed students repeat, left students stop, a mistake is put right", async () => {
    expect(await now("S2006")).toBe("III:studying");
    expect(await now("S2024")).toBe("UKG:studying");
    expect(await now("S2010")).toBe("IX:left");
    expect(await status("S2010")).toBe("left");
    expect(await now("S2031")).toBe("XII:left");
    expect(await now("S2025")).toBe("VII:studying"); // repeat → promote again
    expect(R.corrections.every((c) => !c.result.startsWith("REFUSED"))).toBe(true);
  });

  it("unpaid dues move into the new session; the failed student keeps her dues; left students' dues stay collectable", async () => {
    const carried = async (adm: string) => (await bills(adm, "OPENING")).reduce((a, i) => a + i.net + i.credited, 0);
    expect(await carried("S2028")).toBeGreaterThan(0); // never paid, promoted
    expect(await carried("S2024")).toBeGreaterThan(0); // failed and owes
    expect(await carried("S2001")).toBe(0); // always paid
    expect((await core.payments.counterView(ids.S2031!)).total).toBeGreaterThan(0); // left, still owes
  });

  it("April 2027 bills: new class fees, repeaters in their old class, nobody who left or passed out, siblings still get their discount", async () => {
    expect(await bills("S2001", "2027-04")).toHaveLength(1);
    expect(await bills("S2006", "2027-04")).toHaveLength(1);
    for (const adm of ["S2010", "S2031", "S2014", "S2044"]) expect(await bills(adm, "2027-04"), adm).toHaveLength(0);
    const [sib] = await bills("S2037", "2027-04");
    const lines = await db.getDb().select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.invoiceId, sib!.id));
    expect(lines.find((l) => l.description.startsWith("Tuition"))!.discount).toBeGreaterThan(0);
    const [rte] = await bills("S2042", "2027-04");
    expect(rte!.net).toBe(0); // RTE still free
  });

  it("advance money stays with the student into the new session", async () => {
    const before = (await core.payments.counterView(ids.S2043!));
    expect(before.wallet + before.total).toBeGreaterThan(0);
  });

  it("once the new session is billed, changes are refused with a clear message", () => {
    expect(R.lateChange).toMatch(/already has 1 monthly bill/);
  });

  it("the books still balance", async () => {
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
  });
});
