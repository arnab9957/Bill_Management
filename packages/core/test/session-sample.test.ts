/**
 * The 3-session sample (scenarios/session-sample.ts) on a throw-away database: each student's story is checked.
 * Enabled with RUN_DB_TESTS=1 (needs `pnpm db:start`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_sample_test";
const run = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!run)("3-session sample with promotions and new admissions", () => {
  let core: typeof import("../src"), db: typeof import("@sb/db");
  let ids: Record<string, number>;
  const hist = async (adm: string) => (await core.students.listEnrollments(ids[adm]!)).map((e) => `${e.yearName}:${e.className}:${e.e.status}`);
  const months = async (adm: string) => (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, ids[adm]!)))
    .filter((i) => /^\d{4}-\d{2}$/.test(i.period) && i.status !== "cancelled").map((i) => i.period).sort();
  const span = (a: string, b: string) => { const o: string[] = []; for (let p = a; p <= b;) { o.push(p); const [y, m] = p.split("-").map(Number); p = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`; } return o; };

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
    const s = await import("../scenarios/session-sample");
    ids = (await s.loadSessionSample()).ids;
  }, 600_000);

  it("Asha: promoted every December, one bill every month with no gap", async () => {
    expect(await hist("P01")).toEqual(["2024-25:Nursery:promoted", "2025-26:LKG:promoted", "2026-27:UKG:studying"]);
    expect(await months("P01")).toEqual(span("2024-01", "2026-11"));
  });

  it("Bablu failed Nursery: two Nursery records, then LKG", async () => {
    expect(await hist("P02")).toEqual(["2024-25:Nursery:promoted", "2025-26:Nursery:promoted", "2026-27:LKG:studying"]);
  });

  it("Chinu left in December 2024: nothing billed afterwards", async () => {
    expect(await hist("P03")).toEqual(["2024-25:Nursery:left"]);
    expect((await months("P03")).at(-1)).toBe("2024-12");
  });

  it("Dolly never pays: dues carried into each new session, nothing lost", async () => {
    const all = await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, ids.P04!));
    expect(all.filter((i) => i.period === "OPENING")).toHaveLength(2);
    const billed = all.filter((i) => i.period !== "OPENING").reduce((a, i) => a + i.net + i.credited, 0);
    expect((await core.payments.counterView(ids.P04!)).total).toBe(billed); // everything she was ever billed is still owed
  });

  it("UKG (Jan-Dec) → Class I (Apr-Mar): no bills for January-March in between", async () => {
    const esha = await months("P05");
    expect(esha).toContain("2025-12");
    expect(esha.filter((p) => p >= "2026-01" && p <= "2026-03")).toEqual([]);
    expect(esha).toContain("2026-04");
    expect(await hist("P05")).toEqual(["2024-25:LKG:promoted", "2025-26:UKG:promoted", "2026-27:I:studying"]);
    const mohan = await months("P06");
    expect(mohan.filter((p) => p >= "2025-01" && p <= "2025-03")).toEqual([]);
    expect(await hist("P06")).toEqual(["2024-25:UKG:promoted", "2025-26:I:promoted", "2026-27:II:studying"]);
  });

  it("Classes I-III promote every March; Hari repeats Class II; Rina's new class has no fees", async () => {
    expect(await hist("P07")).toEqual(["2024-25:I:promoted", "2025-26:II:promoted", "2026-27:III:studying"]);
    expect(await months("P07")).toEqual(span("2024-04", "2026-11"));
    expect(await hist("P09")).toEqual(["2024-25:II:promoted", "2025-26:II:promoted", "2026-27:III:studying"]);
    expect(await hist("P10")).toEqual(["2024-25:III:promoted", "2025-26:IV:studying"]);
    expect((await months("P10")).at(-1)).toBe("2025-03");
  });

  it("new admissions start billing in the month they join, with the admission fee", async () => {
    const first = async (adm: string) => {
      const inv = (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, ids[adm]!))).filter((i) => /^\d{4}-\d{2}$/.test(i.period)).sort((a, b) => a.period.localeCompare(b.period))[0]!;
      const lines = await db.getDb().select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.invoiceId, inv.id));
      return { period: inv.period, admission: lines.some((l) => l.description.startsWith("Admission")) };
    };
    expect(await first("P11")).toEqual({ period: "2024-06", admission: true });
    expect(await first("P12")).toEqual({ period: "2025-07", admission: true });
    expect(await first("P13")).toEqual({ period: "2026-01", admission: true });
    expect(await first("P14")).toEqual({ period: "2026-08", admission: true });
    expect(await first("P15")).toEqual({ period: "2026-04", admission: true });
    // promoted students do NOT pay the admission fee again
    const again = (await db.getDb().select().from(db.invoiceLines).innerJoin(db.invoices, db.dz.eq(db.invoices.id, db.invoiceLines.invoiceId))
      .where(db.dz.eq(db.invoices.studentId, ids.P01!))).filter((r) => r.invoice_line.description.startsWith("Admission"));
    expect(again).toHaveLength(1);
  });

  it("never two bills for one month; books clean", async () => {
    for (const adm of Object.keys(ids)) { const m = await months(adm); expect(new Set(m).size, adm).toBe(m.length); }
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
  });
});
