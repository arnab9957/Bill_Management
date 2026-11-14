/**
 * Runs the real services against a throw-away PostgreSQL database.
 * Enabled with RUN_DB_TESTS=1 (needs the dev server from `pnpm db:start`).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const TEST_DB = "school_billing_test";
const run = process.env.RUN_DB_TESTS === "1";

type Core = typeof import("../src");
let core: Core;
let db: typeof import("@sb/db");

describe.skipIf(!run)("integration", () => {
  const admin = { id: 1, role: "ADMIN" as const, username: "admin", fullName: "Admin" };
  let cashier: { id: number; role: "CASHIER"; username: string; fullName: string };
  let studentA: number, studentB: number;

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
    const u = await core.accounts.createUser(admin, { username: "cash1", fullName: "Cashier One", role: "CASHIER", password: "password123" });
    cashier = { id: u.id, role: "CASHIER", username: "cash1", fullName: "Cashier One" };
    const all = await core.students.searchStudents("Kumar");
    studentA = all.find((s) => s.admissionNo === "A1001")!.id;
    studentB = all.find((s) => s.admissionNo === "A1002")!.id;
    // Sibling concession for B
    const types = await core.fees.listConcessionTypes();
    await core.fees.grantConcession(admin, { studentId: studentB, concessionTypeId: types.find((t) => t.t.name === "Sibling")!.t.id, validFrom: "2026-04-01" });
  }, 120_000);

  it("dry run plans without writing; commit creates; re-run creates nothing", async () => {
    const dry = await core.billing.generateInvoices({ period: "2026-04", dryRun: true });
    expect(dry.planned.length).toBe(2);
    expect(dry.created.length).toBe(0);
    // Class V: tuition 1500+7*100 = ₹2,200, annual ₹5,000, exam ₹600, admission ₹10,000 (admitted this year)
    const a = dry.planned.find((p) => p.studentId === studentA)!;
    expect(a.net).toBe(220000 + 500000 + 60000 + 1000000);
    const b = dry.planned.find((p) => p.studentId === studentB)!;
    expect(b.net).toBe(a.net - 22000); // 10% sibling concession on tuition

    const first = await core.billing.generateInvoices({ period: "2026-04", dryRun: false });
    expect(first.created.length).toBe(2);
    expect(first.created[0]!.invoiceNo).toMatch(/^INV\/2026-27\/\d{6}$/);
    const again = await core.billing.generateInvoices({ period: "2026-04", dryRun: false });
    expect(again.created.length).toBe(0);
    expect(again.skipped.every((s) => s.reason.includes("Already billed"))).toBe(true);

    const may = await core.billing.generateInvoices({ period: "2026-05", dryRun: false });
    const mayA = may.planned.find((p) => p.studentId === studentA)!;
    expect(mayA.lines.map((l) => l.amount)).toEqual([220000]); // only tuition
  });

  it("BILL_GENERATED queued once per channel, deduplicated", async () => {
    const rows = await db.getDb().select().from(db.notificationOutbox);
    const bill = rows.filter((r) => r.event === "BILL_GENERATED");
    expect(bill.length).toBe(4 * 3); // 4 invoices × sms/whatsapp/email
    expect(new Set(bill.map((r) => r.idempotencyKey)).size).toBe(bill.length);
  });

  it("two counters collecting at the same moment cannot double-allocate", async () => {
    const before = await core.payments.counterView(studentA);
    const total = before.total;
    const pay = (amt: number) => core.payments.collectPayment({ studentId: studentA, amount: amt, mode: "cash", date: "2026-05-02" }, cashier);
    const [r1, r2] = await Promise.all([pay(total), pay(total)]);
    // One clears all dues; the other must go entirely to the wallet.
    const toWallet = [r1.toWallet, r2.toWallet].sort((x, y) => x - y);
    expect(toWallet).toEqual([0, total]);
    const after = await core.payments.counterView(studentA);
    expect(after.total).toBe(0);
    expect(after.wallet).toBe(total);
  });

  it("wallet is applied automatically to the next bill", async () => {
    await core.billing.generateInvoices({ period: "2026-06", studentId: studentA, dryRun: false });
    const v = await core.payments.counterView(studentA);
    expect(v.total).toBe(0);
    const [w] = await db.getDb().select().from(db.studentWallets).where(db.dz.eq(db.studentWallets.studentId, studentA));
    expect(w!.balance).toBeGreaterThan(0);
  });

  it("cancelling a receipt reverses allocations and is audited", async () => {
    const r = await core.payments.collectPayment({ studentId: studentB, amount: 50000, mode: "upi", referenceNo: "UTR123", date: "2026-05-02" }, cashier);
    const beforeCancel = await core.payments.counterView(studentB);
    await core.payments.cancelReceipt(admin, { paymentId: r.paymentId, reason: "Wrong student selected" });
    const afterCancel = await core.payments.counterView(studentB);
    expect(afterCancel.total).toBe(beforeCancel.total + 50000);
    await expect(core.payments.cancelReceipt(admin, { paymentId: r.paymentId, reason: "again please" })).rejects.toThrow(/already cancelled/);
    const trail = await core.reports.auditTrail({ table: "payment" });
    expect(trail.some((t) => t.a.action === "cancel" && t.a.recordId === String(r.paymentId))).toBe(true);
  });

  it("late fee is added once per step, capped", async () => {
    const r1 = await core.billing.applyLateFees("2026-05-30");
    const r2 = await core.billing.applyLateFees("2026-05-30");
    expect(r1.added).toBeGreaterThan(0);
    expect(r2.added).toBe(0);
    const inv = (await core.billing.listInvoices({ period: "2026-04" })).find((i) => i.inv.studentId === studentB)!;
    // due 10 Apr, grace 5 → 45 days × ₹10 = ₹450 (under the ₹500 cap)
    expect(inv.inv.lateFee).toBe(45000);
    await core.billing.applyLateFees("2026-06-30"); // 76 days → capped
    const capped = (await core.billing.listInvoices({ period: "2026-04" })).find((i) => i.inv.studentId === studentB)!;
    expect(capped.inv.lateFee).toBe(50000);
  });

  it("reminders: siblings combined, paid invoices not chased, offline queues and later sends", async () => {
    const n = await core.notifications.queueDueReminders("2026-05-13"); // May bills due 10th → +3 overdue
    expect(n).toBe(3); // one guardian, three channels (only B has dues)
    const n2 = await core.notifications.queueDueReminders("2026-05-13");
    expect(n2).toBe(0);
    const sent: string[] = [];
    const fake = { send: async (m: { recipient: string }) => { sent.push(m.recipient); return { ok: true as const }; } };
    const adapters = { sms: fake, whatsapp: fake, email: fake };
    const now = new Date("2026-05-13T10:00:00");
    // rows are stamped with the real clock; move them to the simulated day
    await db.getDb().update(db.notificationOutbox).set({ nextAttemptAt: new Date("2026-05-13T08:00:00") });
    const offline = await core.notifications.dispatchOutbox({ adapters, isOnline: async () => false, now });
    expect(offline.skippedReason).toBe("offline");
    expect(sent.length).toBe(0);
    const online = await core.notifications.dispatchOutbox({ adapters, isOnline: async () => true, now });
    expect(online.sent).toBeGreaterThan(0);
    const again = await core.notifications.dispatchOutbox({ adapters, isOnline: async () => true, now });
    expect(again.sent).toBe(0);
  });

  it("day close locks the cashier's day", async () => {
    await core.payments.closeDay(cashier, { date: "2026-05-02", counts: { "500": 1 } });
    await expect(core.payments.collectPayment({ studentId: studentB, amount: 100, mode: "cash", date: "2026-05-02" }, cashier)).rejects.toThrow(/closed/);
  });

  it("integrity check is clean", async () => {
    const r = await core.ops.integrityCheck();
    expect(r.problems).toEqual([]);
  });
});
