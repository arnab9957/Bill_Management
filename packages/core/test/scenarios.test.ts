/**
 * 50 students, April-November 2026, played through the real services on a throw-away database,
 * then every situation is checked. Enabled with RUN_DB_TESTS=1 (needs `pnpm db:start`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_scenarios_test";
const run = process.env.RUN_DB_TESTS === "1";

type Core = typeof import("../src");
type Sc = typeof import("../scenarios/scenarios");
let core: Core, db: typeof import("@sb/db"), sc: Sc, L: Awaited<ReturnType<Sc["loadScenarios"]>>;

describe.skipIf(!run)("real-life scenarios (50 students)", () => {
  const id = (adm: string) => L.ids[adm] ?? 0;
  const view = (adm: string) => core.payments.counterView(id(adm));
  const bills = async (adm: string) => (await db.getDb().select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, id(adm))))
    .sort((a, b) => a.id - b.id);
  const monthly = async (adm: string) => (await bills(adm)).filter((b) => /^\d{4}-\d{2}$/.test(b.period));
  const lines = async (invoiceId: number) => db.getDb().select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.invoiceId, invoiceId));

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
    sc = await import("../scenarios/scenarios");
    L = await sc.loadScenarios();
  }, 300_000);

  it("has 52 students: 50 loaded + the 2 demo students", async () => {
    expect(Object.keys(L.ids)).toHaveLength(50);
    expect(await db.getDb().select().from(db.students)).toHaveLength(52);
  });

  it("running a month's bills again creates nothing new", async () => {
    for (const p of ["2026-04", "2026-08", "2026-11"]) {
      const r = await core.billing.generateInvoices({ period: p, dryRun: false });
      expect(r.created).toHaveLength(0);
    }
  });

  it("on-time payers owe nothing and have one bill per month, April to November", async () => {
    for (const s of sc.SPECS.filter((x) => x.pay === "ontime" && !x.special && !x.admitted)) {
      expect((await view(s.adm)).total, s.adm).toBe(0);
      expect((await monthly(s.adm)).map((b) => b.period), s.adm).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
      expect((await monthly(s.adm)).every((b) => b.status === "paid" && b.lateFee === 0), s.adm).toBe(true);
    }
  });

  it("April bill: old students pay tuition + annual + exam; a new student also pays the admission fee", async () => {
    const heads = async (adm: string) => {
      const apr = (await monthly(adm)).find((b) => b.period === "2026-04")!;
      return (await lines(apr.id)).map((l) => l.description.split(" – ")[0]).sort();
    };
    expect(await heads("S2004")).toEqual(["Annual Charges", "Examination Fee", "Tuition Fee"]);
    expect(await heads("S2016")).toEqual(["Admission Fee", "Annual Charges", "Examination Fee", "Tuition Fee"]);
  });

  it("students who join mid-year are billed from their joining month, with the yearly fees on the first bill", async () => {
    const jul = await monthly("S2017");
    expect(jul.map((b) => b.period)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    const first = (await lines(jul[0]!.id)).map((l) => l.description.split(" – ")[0]).sort();
    // Exam fee is half-yearly (April, October): a July joiner first pays it in October.
    expect(first).toEqual(["Admission Fee", "Annual Charges", "Tuition Fee"]);
    const oct = jul.find((b) => b.period === "2026-10")!;
    expect((await lines(oct.id)).some((l) => l.description.startsWith("Examination"))).toBe(true);
    expect((await monthly("S2018")).map((b) => b.period)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect((await monthly("S2019")).map((b) => b.period)).toEqual(["2026-11"]);
  });

  it("late payers are charged a late fee and still clear their dues", async () => {
    for (const s of sc.SPECS.filter((x) => x.pay === "late")) {
      expect((await view(s.adm)).total, s.adm).toBe(0);
      const withLate = (await monthly(s.adm)).filter((b) => b.lateFee > 0);
      expect(withLate.length, s.adm).toBeGreaterThanOrEqual(7);
    }
  });

  it("defaulters: never-payers owe every bill, late fees are capped at ₹500 per bill, and they are on the defaulters list", async () => {
    const list = await core.reports.defaulters({ onDate: "2026-11-19" });
    const owing = new Set(list.map((r: { studentId?: number; id?: number }) => r.studentId ?? r.id));
    for (const adm of ["S2028", "S2029", "S2030", "S2031"]) {
      const b = await monthly(adm);
      expect(b).toHaveLength(8);
      expect(b.every((x) => x.paid === 0 && x.lateFee <= 50000), adm).toBe(true);
      expect(b.find((x) => x.period === "2026-04")!.lateFee, adm).toBe(50000);
      expect((await view(adm)).total, adm).toBe(b.reduce((a, x) => a + x.balance, 0));
      expect(owing.has(id(adm)), `${adm} on defaulters list`).toBe(true);
    }
    for (const adm of ["S2001", "S2042"]) expect(owing.has(id(adm)), `${adm} not a defaulter`).toBe(false);
  });

  it("partial payers have a balance left; quarterly payers are clear after paying in November", async () => {
    for (const s of sc.SPECS.filter((x) => x.pay === "partial")) expect((await view(s.adm)).total, s.adm).toBeGreaterThan(0);
    for (const adm of ["S2032", "S2033"]) expect((await view(adm)).total, adm).toBe(0);
    for (const adm of ["S2034", "S2035"]) {
      const b = await monthly(adm);
      expect(b.filter((x) => x.period <= "2026-07").every((x) => x.status === "paid"), adm).toBe(true);
      expect(b.filter((x) => x.period >= "2026-08").every((x) => x.paid === 0), adm).toBe(true);
    }
  });

  it("concessions: 10% sibling and 50% staff on tuition, RTE bills are ₹0", async () => {
    const tuition = async (adm: string) => {
      const apr = (await monthly(adm)).find((b) => b.period === "2026-04")!;
      return (await lines(apr.id)).find((l) => l.description.startsWith("Tuition"))!;
    };
    const sib = await tuition("S2037");
    expect(sib.discount).toBe(Math.round(sib.amount * 0.1));
    expect((await tuition("S2036")).discount).toBe(0); // the eldest child pays full
    const staff = await tuition("S2041");
    expect(staff.discount).toBe(Math.round(staff.amount * 0.5));
    const rte = await monthly("S2042");
    expect(rte).toHaveLength(8);
    expect(rte.every((b) => b.net === 0 && b.balance === 0 && b.lateFee === 0)).toBe(true);
  });

  it("siblings share one guardian", async () => {
    const g = async (adm: string) => (await db.getDb().select().from(db.studentGuardians).where(db.dz.eq(db.studentGuardians.studentId, id(adm))))[0]!.guardianId;
    expect(new Set([await g("S2036"), await g("S2037"), await g("S2038")]).size).toBe(1);
    expect(await g("S2039")).toBe(await g("S2040"));
  });

  it("advance payment is used up by later bills", async () => {
    const b = await monthly("S2043");
    expect(b.filter((x) => x.period <= "2026-09").every((x) => x.status === "paid"), "first months covered by advance").toBe(true);
    const v = await view("S2043");
    expect(v.wallet).toBe(0);
    expect(v.total).toBeGreaterThan(0); // advance ran out, now owes
  });

  it("students who left are not billed afterwards; unused advance is refunded and cannot be refunded twice", async () => {
    expect((await monthly("S2044")).map((b) => b.period).at(-1)).toBe("2026-08");
    expect((await monthly("S2045")).map((b) => b.period).at(-1)).toBe("2026-07");
    expect((await view("S2045")).wallet).toBe(0);
    await expect(core.payments.refund(L.admin, { studentId: id("S2045"), amount: "100", mode: "cash", reason: "second refund" })).rejects.toThrow(/available/);
    const r = await core.billing.generateInvoices({ period: "2026-11", studentId: id("S2044"), dryRun: true });
    expect(r.planned).toHaveLength(0);
  });

  it("bounced cheque: receipt reversed, ₹200 charge billed, later paid; cleared cheques stay valid", async () => {
    const [p] = await db.getDb().select().from(db.payments).where(db.dz.eq(db.payments.id, L.refs.bouncedPaymentId!));
    expect(p!.status).toBe("cancelled");
    const charge = (await bills("S2046")).find((b) => b.period.startsWith("CHQ-"))!;
    expect(charge.net).toBe(20000);
    expect((await view("S2046")).total).toBe(0);
    const chq = await core.payments.listCheques();
    expect(chq.filter((c) => c.c.status === "bounced")).toHaveLength(1);
    expect(chq.filter((c) => c.c.status === "pending")).toHaveLength(chq.filter((c) => c.date >= "2026-07-01").length);
    expect(chq.filter((c) => c.admissionNo === "S2047" && c.date < "2026-07-01").every((c) => c.c.status === "cleared")).toBe(true);
  });

  it("cancelled receipt: money taken off, collected again, old dues from the paper register paid", async () => {
    const [p] = await db.getDb().select().from(db.payments).where(db.dz.eq(db.payments.id, L.refs.cancelledPaymentId!));
    expect(p!.status).toBe("cancelled");
    expect(p!.cancelReason).toMatch(/wrong student/);
    const opening = (await bills("S2048")).find((b) => b.period === "OPENING")!;
    expect(opening.net).toBe(450000);
    expect(opening.balance).toBe(0);
    expect((await view("S2048")).total).toBe(0);
    await expect(core.payments.cancelReceipt(L.admin, { paymentId: p!.id, reason: "once more please" })).rejects.toThrow(/already cancelled/);
  });

  it("extra charges: books paid to the paisa, wrong charge cancelled, part of a bill waived", async () => {
    const all = await bills("S2049");
    const books = all.find((b) => b.period.startsWith("MISC-") && b.status !== "cancelled")!;
    expect(books.net).toBe(125050);
    expect(books.status).toBe("paid");
    const uniform = all.find((b) => b.id === L.refs.cancelledMiscInvoiceId)!;
    expect(uniform.status).toBe("cancelled");
    expect(uniform.balance).toBe(0);
    const cn = await db.getDb().select().from(db.creditNotes).where(db.dz.eq(db.creditNotes.invoiceId, L.refs.creditNoteInvoiceId!));
    expect(cn.map((x) => x.amount)).toEqual([50000]);
  });

  it("cashier can collect a chosen head only: tuition paid, other heads of that bill still due", async () => {
    const [l] = await db.getDb().select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.id, L.refs.tuitionOnlyLineId!));
    expect(l!.paid).toBe(l!.net);
    const others = (await lines(l!.invoiceId)).filter((x) => x.id !== l!.id && x.kind === "fee");
    expect(others.every((x) => x.paid === 0)).toBe(true);
  });

  it("guardians who refused messages get none; reminders are combined per family", async () => {
    const outbox = await db.getDb().select().from(db.notificationOutbox);
    const [link] = await db.getDb().select().from(db.studentGuardians).where(db.dz.eq(db.studentGuardians.studentId, id("S2030")));
    const [g] = await db.getDb().select().from(db.guardians).where(db.dz.eq(db.guardians.id, link!.guardianId));
    expect(g!.messagingConsent).toBe(false);
    const toThem = outbox.filter((o) => o.recipient === g!.mobile || o.recipient === `91${g!.mobile}` || o.recipient.endsWith(g!.mobile));
    expect(toThem.filter((o) => o.status !== "cancelled" && o.status !== "failed")).toHaveLength(0);
    // A consenting parent of a defaulter does get messages.
    const [l2] = await db.getDb().select().from(db.studentGuardians).where(db.dz.eq(db.studentGuardians.studentId, id("S2028")));
    const [g2] = await db.getDb().select().from(db.guardians).where(db.dz.eq(db.guardians.id, l2!.guardianId));
    expect(outbox.some((o) => o.recipient.endsWith(g2!.mobile))).toBe(true);
  });

  it("wrong input is refused with a clear message", async () => {
    const c = (await core.fees.masters()).classes[0]!;
    const base = { admissionNo: "S2001", name: "Copy", classId: c.id, admissionDate: "2026-04-01", guardian: { name: "X", mobile: "9876500099", whatsappNo: "9876500099", messagingConsent: "on" } };
    await expect(core.students.admitStudent(L.admin, base)).rejects.toThrow(/already exists/);
    await expect(core.students.admitStudent(L.admin, { ...base, admissionNo: "NEW1", guardian: { ...base.guardian, mobile: "12345" } })).rejects.toThrow(/mobile/);
    const pay = (x: object) => core.payments.collectPayment({ studentId: id("S2028"), amount: 10000, mode: "cash", date: "2026-11-19", ...x } as never, L.cashier);
    await expect(pay({ amount: 0 })).rejects.toThrow(/greater than zero/);
    await expect(pay({ mode: "upi" })).rejects.toThrow(/Reference/);
    await expect(pay({ mode: "cheque", chequeNo: "1" })).rejects.toThrow(/bank/i);
    const paidBill = (await monthly("S2001"))[0]!;
    await expect(core.billing.cancelInvoice(L.admin, { invoiceId: paidBill.id, reason: "testing a paid bill" })).rejects.toThrow(/payments against it/);
    const owing = (await monthly("S2028"))[0]!;
    await expect(core.billing.issueCreditNote(L.admin, { invoiceId: owing.id, amount: "999999", reason: "too much credit" })).rejects.toThrow(/cannot exceed/);
  });

  it("amounts typed with ₹ and commas are read correctly", async () => {
    const { rupeesToPaise } = await import("@sb/validation");
    expect(rupeesToPaise.parse("₹1,234.50")).toBe(123450);
    expect(rupeesToPaise.parse("1234")).toBe(123400);
    expect(rupeesToPaise.safeParse("12.345").success).toBe(false);
  });

  it("books balance: every rupee billed is either paid, credited or still due, and the integrity check is clean", async () => {
    const inv = (await db.getDb().select().from(db.invoices)).filter((i) => i.status !== "cancelled");
    for (const i of inv) expect(i.net - i.paid, i.invoiceNo).toBe(i.balance);
    const valid = (await db.getDb().select().from(db.payments)).filter((p) => p.status === "valid");
    const allocated = (await db.getDb().select().from(db.paymentAllocations)).filter((a) => !a.reversedAt).reduce((a, x) => a + x.amount, 0);
    const refunded = (await db.getDb().select().from(db.refunds)).reduce((a, r) => a + r.amount, 0);
    const wallets = (await db.getDb().select().from(db.studentWallets)).reduce((a, w) => a + w.balance, 0);
    expect(valid.reduce((a, p) => a + p.amount, 0)).toBe(allocated + refunded + wallets);
    expect((await core.ops.integrityCheck()).problems).toEqual([]);
  });
});
