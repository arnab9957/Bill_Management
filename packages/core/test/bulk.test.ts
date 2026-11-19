/**
 * Volume test: 1,000 generated students (plus the 2 demo students), April-November 2026,
 * through the real services on a throw-away database. Every rule is checked for every student.
 * Enabled with RUN_DB_TESTS=1 (needs `pnpm db:start`). Takes a few minutes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_bulk_test";
const N = Number(process.env.BULK_STUDENTS ?? 1000);
const run = process.env.RUN_DB_TESTS === "1";
const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

type Inv = typeof import("@sb/db").invoices.$inferSelect;
type Line = typeof import("@sb/db").invoiceLines.$inferSelect;
type Spec = import("../scenarios/scenarios").Spec;

describe.skipIf(!run)(`volume: ${N} students`, () => {
  let core: typeof import("../src"), db: typeof import("@sb/db");
  let specs: Spec[], ids: Record<string, number>, loadSeconds = 0;
  const bills = new Map<number, Inv[]>();
  const linesOf = new Map<number, Line[]>();
  const monthly = (s: Spec) => (bills.get(ids[s.adm]!) ?? []).filter((b) => /^\d{4}-\d{2}$/.test(b.period)).sort((a, b) => a.period.localeCompare(b.period));
  const owed = (s: Spec) => (bills.get(ids[s.adm]!) ?? []).filter((b) => b.status !== "cancelled").reduce((a, b) => a + b.balance, 0);
  const firstMonth = (s: Spec) => (s.admitted && s.admitted >= "2026-04-01" ? s.admitted.slice(0, 7) : "2026-04");
  const group = (p: Spec["pay"]) => specs.filter((s) => s.pay === p);

  async function snapshot() {
    bills.clear(); linesOf.clear();
    for (const i of await db.getDb().select().from(db.invoices)) bills.set(i.studentId, [...(bills.get(i.studentId) ?? []), i]);
    for (const l of await db.getDb().select().from(db.invoiceLines)) linesOf.set(l.invoiceId, [...(linesOf.get(l.invoiceId) ?? []), l]);
  }

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
    const sc = await import("../scenarios/scenarios");
    specs = sc.bulkSpecs(N);
    const t = Date.now();
    ids = (await sc.loadScenarios((m) => console.log(m), specs)).ids;
    loadSeconds = (Date.now() - t) / 1000;
    console.log(`Loaded ${N} students and 8 months in ${loadSeconds.toFixed(0)} s`);
    await snapshot();
  }, 3_600_000);

  it(`all ${N} students were admitted, with the planned mix`, async () => {
    expect(Object.keys(ids)).toHaveLength(N);
    expect(await db.getDb().select().from(db.students)).toHaveLength(N + 2);
    const mix = Object.fromEntries(["ontime", "late", "partial", "never", "quarterly", "stopped", "rte"].map((p) => [p, group(p as Spec["pay"]).length]));
    console.log("Mix:", mix, "| joined mid-year:", specs.filter((s) => s.admitted).length, "| in families:", specs.filter((s) => s.family).length);
    for (const v of Object.values(mix)) expect(v).toBeGreaterThan(0);
  });

  it("every student has exactly one bill per month, from the month they joined to November", () => {
    const bad: string[] = [];
    for (const s of specs) {
      const want = MONTHS.filter((m) => m >= firstMonth(s));
      const got = monthly(s).map((b) => b.period);
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${s.adm} (${s.story}): ${got.join(",")}`);
    }
    expect(bad).toEqual([]);
  });

  it("bill numbers are unique and running the bills again creates nothing", async () => {
    const all = [...bills.values()].flat();
    expect(new Set(all.map((b) => b.invoiceNo)).size).toBe(all.length);
    for (const p of ["2026-04", "2026-11"]) expect((await core.billing.generateInvoices({ period: p, dryRun: false })).created).toHaveLength(0);
  });

  it("the first bill has the yearly fees; the admission fee only for students who joined this year", () => {
    const bad: string[] = [];
    for (const s of specs) {
      const heads = (linesOf.get(monthly(s)[0]!.id) ?? []).map((l) => l.description.split(" – ")[0]);
      const isNew = !!s.admitted && s.admitted >= "2026-04-01";
      if (!heads.includes("Annual Charges") || heads.includes("Admission Fee") !== isNew) bad.push(`${s.adm}: ${heads.join(", ")}`);
    }
    expect(bad).toEqual([]);
  });

  it("people who pay in full (on time, late, every 3 months) owe nothing; RTE students owe nothing", () => {
    const bad = specs.filter((s) => ["ontime", "late", "quarterly", "rte"].includes(s.pay) &&owed(s) !== 0)
      .map((s) => `${s.adm} (${s.story}) owes ${owed(s)}`);
    expect(bad).toEqual([]);
  });

  it("on-time payers never pay a late fee; late payers always do", () => {
    expect(group("ontime").filter((s) => monthly(s).some((b) => b.lateFee > 0)).map((s) => s.adm)).toEqual([]);
    const lateWithout = group("late").filter((s) => monthly(s).some((b) => b.period < "2026-11" && b.lateFee === 0 && b.net > 0)).map((s) => s.adm);
    expect(lateWithout).toEqual([]);
  });

  it("never-payers: nothing paid, every bill overdue by November carries a late fee of at most ₹500", () => {
    const bad: string[] = [];
    for (const s of group("never")) for (const b of monthly(s)) {
      if (b.paid !== 0 || b.lateFee > 50000 || (b.dueDate < "2026-11-10" && b.lateFee === 0)) bad.push(`${s.adm} ${b.period}: paid ${b.paid}, late ${b.lateFee}`);
    }
    expect(bad).toEqual([]);
  });

  it("half payers still owe; stopped payers cleared April-July and paid nothing from August", () => {
    expect(group("partial").filter((s) => owed(s) === 0).map((s) => s.adm)).toEqual([]);
    const bad = group("stopped").filter((s) => monthly(s).some((b) => (b.period <= "2026-07" ? b.balance !== 0 : b.paid !== 0))).map((s) => s.adm);
    expect(bad).toEqual([]);
  });

  it("concessions: sibling 10% and staff 50% off tuition, RTE bills are ₹0, others get no discount", () => {
    const bad: string[] = [];
    for (const s of specs) {
      for (const b of monthly(s)) {
        if (s.concession === "RTE") { if (b.net !== 0) bad.push(`${s.adm} RTE bill ${b.net}`); continue; }
        for (const l of linesOf.get(b.id) ?? []) {
          const tuition = l.description.startsWith("Tuition");
          const want = !tuition ? 0 : s.concession === "Sibling" ? Math.round(l.amount * 0.1) : s.concession === "Staff ward" ? Math.round(l.amount * 0.5) : 0;
          if (l.kind === "fee" && l.discount !== want) bad.push(`${s.adm} ${b.period} ${l.description}: ${l.discount} ≠ ${want}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("brothers and sisters share one guardian", async () => {
    const links = await db.getDb().select().from(db.studentGuardians);
    const g = new Map(links.map((l) => [l.studentId, l.guardianId]));
    const fam = new Map<string, Set<number>>();
    for (const s of specs.filter((x) => x.family)) fam.set(s.family!, (fam.get(s.family!) ?? new Set()).add(g.get(ids[s.adm]!)!));
    expect([...fam.entries()].filter(([, set]) => set.size !== 1).map(([f]) => f)).toEqual([]);
  });

  it("defaulters list: everyone with overdue money is on it, nobody who has paid up is", async () => {
    const list = await core.reports.defaulters({ onDate: "2026-11-19" });
    const on = new Set(list.map((r: { studentId?: number; id?: number }) => r.studentId ?? r.id));
    const missing = group("never").filter((s) => monthly(s).some((b) => b.dueDate < "2026-11-19") && !on.has(ids[s.adm]!)).map((s) => s.adm);
    const wrong = specs.filter((s) => owed(s) === 0 && on.has(ids[s.adm]!)).map((s) => s.adm);
    expect({ missing, wrong }).toEqual({ missing: [], wrong: [] });
  });

  it("the money adds up: every bill's balance is net − paid, and every rupee collected is applied, refunded or held as advance", async () => {
    const bad = [...bills.values()].flat().filter((i) => i.status !== "cancelled" && i.net - i.paid !== i.balance).map((i) => i.invoiceNo);
    expect(bad).toEqual([]);
    const valid = (await db.getDb().select().from(db.payments)).filter((p) => p.status === "valid");
    const allocated = (await db.getDb().select().from(db.paymentAllocations)).filter((a) => !a.reversedAt).reduce((a, x) => a + x.amount, 0);
    const refunded = (await db.getDb().select().from(db.refunds)).reduce((a, r) => a + r.amount, 0);
    const wallets = (await db.getDb().select().from(db.studentWallets)).reduce((a, w) => a + w.balance, 0);
    expect(valid.reduce((a, p) => a + p.amount, 0)).toBe(allocated + refunded + wallets);
    const receipts = valid.map((p) => p.receiptNo);
    expect(new Set(receipts).size).toBe(receipts.length);
    console.log(`Bills: ${[...bills.values()].flat().length}, receipts: ${valid.length}`);
  });

  it("reports agree with the bills", async () => {
    const byClass = await core.reports.outstandingByClass("2026-11-19");
    const reportTotal = byClass.reduce((a, r) => a + r.balance, 0);
    const billTotal = [...bills.values()].flat().filter((b) => b.status !== "cancelled").reduce((a, b) => a + b.balance, 0);
    expect(reportTotal).toBe(billTotal);
  });

  it("integrity check is clean, and a full month's bill run stays fast", async () => {
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
    const t = Date.now();
    const dry = await core.billing.generateInvoices({ period: "2026-12", dryRun: true });
    const secs = (Date.now() - t) / 1000;
    console.log(`December dry run for ${dry.planned.length} students: ${secs.toFixed(1)} s`);
    expect(dry.planned.length).toBeGreaterThan(N * 0.9);
    expect(secs).toBeLessThan(30);
  });
});
