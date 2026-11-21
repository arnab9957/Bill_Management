/**
 * Real-life situations for testing: 50 students (S2001-S2050, besides the two demo students A1001/A1002),
 * played month by month from April to November 2026 through the app's own billing and payment code.
 *
 * Needs a database made with `seed.ts --demo` (demo school, fee structures, concession types).
 * Used by test/scenarios.test.ts (throw-away database) and scenarios/load.ts (a test school to click through).
 */
import * as core from "../src";
import * as db from "@sb/db";

type Pay = "ontime" | "late" | "partial" | "never" | "quarterly" | "stopped" | "rte";

export interface Spec {
  adm: string;
  name: string;
  cls: string;
  section?: "A" | "B";
  /** default 2023-04-01 (an old student: no admission fee this year) */
  admitted?: string;
  pay: Pay;
  mode?: "cash" | "upi" | "cheque";
  /** students with the same family share one guardian */
  family?: string;
  noConsent?: boolean;
  /** what this student is meant to show; printed for the person testing */
  story: string;
  concession?: "Sibling" | "Staff ward" | "RTE";
  special?: Special[];
}
type Special =
  | "advance" | "left_aug" | "left_refund" | "cheque_bounce" | "cheque_clear" | "cancel_receipt" | "opening"
  | "misc_paid" | "misc_cancelled" | "credit_note" | "tuition_only" | "paise";

const OLD = "2023-04-01";
const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"] as const;

export const SPECS: Spec[] = [
  // ---- pays every bill in full, on time (the normal case)
  { adm: "S2001", name: "Aarav Sharma", cls: "Nursery", section: "A", pay: "ontime", story: "Pays every month on time in cash: nothing due" },
  { adm: "S2002", name: "Diya Verma", cls: "LKG", section: "A", pay: "ontime", mode: "upi", story: "Pays on time by UPI (with UTR number)" },
  { adm: "S2003", name: "Vivaan Gupta", cls: "UKG", section: "B", pay: "ontime", story: "Pays on time" },
  { adm: "S2004", name: "Ananya Singh", cls: "I", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2005", name: "Aditya Yadav", cls: "II", section: "A", pay: "ontime", mode: "upi", story: "Pays on time by UPI" },
  { adm: "S2006", name: "Ishita Mishra", cls: "III", section: "B", pay: "ontime", story: "Pays on time" },
  { adm: "S2007", name: "Reyansh Pandey", cls: "IV", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2008", name: "Saanvi Tiwari", cls: "VI", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2009", name: "Kabir Chauhan", cls: "VII", section: "B", pay: "ontime", story: "Pays on time" },
  { adm: "S2010", name: "Myra Joshi", cls: "VIII", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2011", name: "Arjun Patel", cls: "IX", section: "A", pay: "ontime", mode: "upi", story: "Pays on time by UPI" },
  { adm: "S2012", name: "Kiara Mehta", cls: "X", section: "B", pay: "ontime", story: "Pays on time" },
  { adm: "S2013", name: "Rudra Nair", cls: "XI", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2014", name: "Pari Iyer", cls: "XII", section: "A", pay: "ontime", story: "Pays on time" },
  { adm: "S2015", name: "Shaurya Reddy", cls: "Nursery", pay: "ontime", story: "Pays on time; no section given" },
  // ---- new admissions
  { adm: "S2016", name: "Navya Das", cls: "I", section: "B", admitted: "2026-04-01", pay: "ontime", story: "New this year: April bill has the ₹10,000 admission fee" },
  { adm: "S2017", name: "Atharv Bose", cls: "V", section: "A", admitted: "2026-07-12", pay: "ontime", story: "Joined in July: first bill is July, with admission + annual fees (exam fee comes in October); no April-June bills" },
  { adm: "S2018", name: "Riya Ghosh", cls: "III", section: "A", admitted: "2026-09-05", pay: "never", story: "Joined in September and has not paid yet" },
  { adm: "S2019", name: "Krish Saxena", cls: "LKG", section: "B", admitted: "2026-11-02", pay: "never", story: "Joined in November: only the November bill" },
  // ---- pays late (after the due date and grace days): late fee charged
  { adm: "S2020", name: "Anvi Kapoor", cls: "II", section: "B", pay: "late", story: "Always pays on the 25th: late fee added each month, then paid" },
  { adm: "S2021", name: "Ayaan Khan", cls: "IV", section: "B", pay: "late", story: "Pays late every month" },
  { adm: "S2022", name: "Sara Ali", cls: "VII", section: "A", pay: "late", story: "Pays late every month" },
  { adm: "S2023", name: "Dhruv Malhotra", cls: "IX", section: "B", pay: "late", story: "Pays late every month" },
  // ---- pays only part of the bill
  { adm: "S2024", name: "Avni Bhatt", cls: "UKG", section: "A", pay: "partial", story: "Pays half of what is due each month: balance and late fees build up" },
  { adm: "S2025", name: "Vihaan Rao", cls: "VI", section: "B", pay: "partial", story: "Pays half each month" },
  { adm: "S2026", name: "Prisha Kulkarni", cls: "X", section: "A", pay: "partial", story: "Pays half each month" },
  { adm: "S2027", name: "Yuvraj Thakur", cls: "XII", section: "B", pay: "partial", mode: "upi", story: "Pays half each month by UPI" },
  // ---- never pays (defaulters)
  { adm: "S2028", name: "Aadhya Chopra", cls: "I", section: "A", pay: "never", story: "Never paid: on the defaulters list, late fee capped at ₹500 per bill" },
  { adm: "S2029", name: "Ishaan Bajaj", cls: "V", section: "B", pay: "never", story: "Never paid: defaulter" },
  { adm: "S2030", name: "Meera Sinha", cls: "VIII", section: "B", pay: "never", noConsent: true, story: "Never paid, and the parent said no to messages: no SMS/WhatsApp sent" },
  { adm: "S2031", name: "Laksh Dubey", cls: "XI", section: "B", pay: "never", story: "Never paid: defaulter" },
  // ---- pays every three months
  { adm: "S2032", name: "Tara Menon", cls: "II", section: "A", pay: "quarterly", story: "Pays everything in June, September and November only" },
  { adm: "S2033", name: "Advik Pillai", cls: "VII", section: "A", pay: "quarterly", story: "Pays every three months" },
  // ---- paid at first, then stopped
  { adm: "S2034", name: "Kavya Jain", cls: "III", section: "B", pay: "stopped", story: "Paid April-July, nothing since August" },
  { adm: "S2035", name: "Arnav Agarwal", cls: "X", section: "B", pay: "stopped", story: "Paid April-July, then stopped" },
  // ---- families (one parent, several children)
  { adm: "S2036", name: "Rohan Banerjee", cls: "VI", section: "A", family: "banerjee", pay: "ontime", story: "Brother of S2037 and S2038 (same parent)" },
  { adm: "S2037", name: "Riddhi Banerjee", cls: "IV", section: "A", family: "banerjee", pay: "ontime", concession: "Sibling", story: "Sister: 10% sibling concession on tuition" },
  { adm: "S2038", name: "Rishi Banerjee", cls: "UKG", section: "A", family: "banerjee", pay: "ontime", concession: "Sibling", story: "Youngest: 10% sibling concession on tuition" },
  { adm: "S2039", name: "Zara Qureshi", cls: "VIII", section: "A", family: "qureshi", pay: "partial", story: "Sister of S2040 (same parent); the family pays half each month" },
  { adm: "S2040", name: "Zayan Qureshi", cls: "V", section: "A", family: "qureshi", pay: "partial", story: "Brother of S2039" },
  // ---- concessions
  { adm: "S2041", name: "Neha Prasad", cls: "IX", section: "A", pay: "ontime", concession: "Staff ward", story: "Teacher's child: 50% off tuition" },
  { adm: "S2042", name: "Raju Paswan", cls: "II", section: "B", pay: "rte", concession: "RTE", story: "RTE seat: every bill is ₹0, never a defaulter" },
  // ---- money situations
  { adm: "S2043", name: "Aryan Sethi", cls: "VII", section: "B", pay: "never", special: ["advance"], story: "Paid ₹20,000 in advance on 2 April: bills are taken from it until it runs out" },
  { adm: "S2044", name: "Simran Gill", cls: "VI", section: "B", pay: "ontime", special: ["left_aug"], story: "Left school end of August: no bills from September" },
  { adm: "S2045", name: "Harsh Vardhan", cls: "IV", section: "B", pay: "ontime", special: ["advance", "left_refund"], story: "Paid in advance, left in July; the unused advance was refunded" },
  { adm: "S2046", name: "Pooja Rawat", cls: "XI", section: "A", pay: "ontime", mode: "cheque", special: ["cheque_bounce"], story: "Pays by cheque; the May cheque bounced (₹200 charge)" },
  { adm: "S2047", name: "Karan Arora", cls: "XII", section: "A", pay: "ontime", mode: "cheque", special: ["cheque_clear"], story: "Pays by cheque; cheques cleared" },
  { adm: "S2048", name: "Tanya Bhalla", cls: "VIII", section: "B", pay: "ontime", special: ["cancel_receipt", "opening"], story: "₹4,500 old dues from the paper register; one receipt cancelled (wrong student)" },
  { adm: "S2049", name: "Mohit Negi", cls: "IX", section: "B", pay: "partial", special: ["misc_paid", "misc_cancelled", "credit_note", "paise"], story: "Books ₹1,250.50 charged and paid; a uniform charge cancelled; ₹500 waived on the July bill" },
  { adm: "S2050", name: "Nikita Rana", cls: "X", section: "A", pay: "never", special: ["tuition_only"], story: "Paid tuition only (cashier chose the head); other fees still due" },
];

/** Dated payment on the given day of a period, e.g. ("2026-05", 8) → "2026-05-08". */
const on = (period: string, day: number) => `${period}-${String(day).padStart(2, "0")}`;

export interface Loaded {
  ids: Record<string, number>;
  admin: core.Actor;
  cashier: core.Actor;
  /** receipt/charge ids the test looks at */
  refs: { bouncedPaymentId?: number; cancelledPaymentId?: number; cancelledMiscInvoiceId?: number; creditNoteInvoiceId?: number; tuitionOnlyLineId?: number };
}

export async function loadScenarios(log: (s: string) => void = () => {}, specs: Spec[] = SPECS): Promise<Loaded> {
  const fixed = specs.some((x) => x.special?.length);
  const d = db.getDb();
  const [adminRow] = await d.select().from(db.users).where(db.dz.eq(db.users.username, "admin"));
  if (!adminRow) throw new Error("No 'admin' user. Run the demo seed first.");
  const admin: core.Actor = { id: adminRow.id, role: "ADMIN", username: "admin", fullName: adminRow.fullName };
  let [cashRow] = await d.select().from(db.users).where(db.dz.eq(db.users.username, "cashier1"));
  if (!cashRow) {
    const u = await core.accounts.createUser(admin, { username: "cashier1", fullName: "Counter Cashier", role: "CASHIER", password: "cashier12345" });
    [cashRow] = await d.select().from(db.users).where(db.dz.eq(db.users.id, u.id));
  }
  const cashier: core.Actor = { id: cashRow!.id, role: "CASHIER", username: "cashier1", fullName: cashRow!.fullName };

  const existing = await d.select({ id: db.students.id }).from(db.students).where(db.dz.eq(db.students.admissionNo, specs[0]!.adm));
  if (existing.length) throw new Error("Test students are already loaded in this database.");

  // Concessions are part of the situations; the demo school has them off.
  await d.update(db.schoolSettings).set({ concessionsEnabled: true });
  core.clearSettingsCache();

  const m = await core.fees.masters();
  const year = m.years.find((y) => y.name === "2026-27")!;
  const cls = (n: string) => m.classes.find((c) => c.name === n)!;
  const sec = (classId: number, n?: string) => (n ? m.sections.find((s) => s.classId === classId && s.name === n)?.id : undefined);
  const head = (code: string) => m.heads.find((h) => h.code === code)!.id;
  const ctypes = await core.fees.listConcessionTypes();

  // ---- admit everyone (each on their admission date's month, below)
  const ids: Record<string, number> = {};
  const families = new Map<string, number>();
  let phone = specs === SPECS ? 9876510000 : 9700000000;
  // Roll numbers must be unique per class + section: hand out the next free one, counting students already there.
  const rolls = new Map<string, number>();
  for (const e of await d.select().from(db.studentEnrollments).where(db.dz.eq(db.studentEnrollments.academicYearId, year.id))) {
    const k = `${e.classId}:${e.sectionId ?? 0}`;
    rolls.set(k, Math.max(rolls.get(k) ?? 0, Number(e.rollNo) || 0));
  }
  const nextRoll = (classId: number, sectionId?: number) => {
    const k = `${classId}:${sectionId ?? 0}`;
    const n = (rolls.get(k) ?? 0) + 1;
    rolls.set(k, n);
    return String(n);
  };
  async function admit(s: Spec) {
    const c = cls(s.cls);
    const famGuardian = s.family ? families.get(s.family) : undefined;
    const surname = s.name.split(" ").at(-1);
    phone++;
    const sectionId = sec(c.id, s.section);
    const st = await core.students.admitStudent(admin, {
      admissionNo: s.adm, name: s.name, classId: c.id, sectionId, rollNo: nextRoll(c.id, sectionId),
      admissionDate: s.admitted ?? OLD, gender: /a$|i$|ya$/.test(s.name.split(" ")[0]!) ? "F" : "M", academicYearId: year.id,
      ...(famGuardian ? { existingGuardianId: famGuardian } : {
        guardian: {
          name: `Mr. ${surname}`, relation: "Father", mobile: String(phone), whatsappNo: String(phone),
          email: s.noConsent ? "" : `${s.adm.toLowerCase()}@example.com`,
          notifySms: "on", notifyWhatsapp: "on", notifyEmail: "on", messagingConsent: s.noConsent ? "" : "on",
        },
      }),
    });
    ids[s.adm] = st.id;
    if (s.family && !famGuardian) {
      const [g] = await d.select().from(db.studentGuardians).where(db.dz.eq(db.studentGuardians.studentId, st.id));
      families.set(s.family, g!.guardianId);
    }
    if (s.concession) {
      const t = ctypes.find((x) => x.t.name === s.concession)!;
      await core.fees.grantConcession(admin, { studentId: st.id, concessionTypeId: t.t.id, validFrom: "2026-04-01" });
    }
    if (s.special?.includes("opening")) {
      await core.billing.createOpeningBalance(d, admin, st.id, 450000, year.id, year.name, "2026-04-10", "Old dues (paper register)");
    }
  }
  for (const s of specs) if ((s.admitted ?? OLD) < "2026-04-01") await admit(s);
  log(`Admitted ${Object.keys(ids).length} students at the start of the year`);

  const refs: Loaded["refs"] = {};
  const owed = async (sid: number) => (await core.payments.counterView(sid)).total;
  let utr = 400000;
  async function pay(s: Spec, amount: number, date: string) {
    if (amount <= 0) return null;
    const mode = s.mode ?? "cash";
    const extra = mode === "upi" ? { referenceNo: `UTR${++utr}` }
      : mode === "cheque" ? { chequeNo: String(++utr).slice(-6), bank: "State Bank of India", chequeDate: date } : {};
    return core.payments.collectPayment({ studentId: ids[s.adm]!, amount, mode, date, ...extra }, cashier);
  }

  // ---- play the year month by month
  for (const [i, period] of MONTHS.entries()) {
    // admissions during this month
    for (const s of specs) if (s.admitted && s.admitted.startsWith(period)) await admit(s);

    // money paid in advance before the April bills
    if (period === "2026-04") {
      for (const s of specs.filter((x) => x.special?.includes("advance"))) {
        await core.payments.collectPayment({ studentId: ids[s.adm]!, amount: 2000000, mode: "cash", date: "2026-04-02" }, cashier);
      }
    }
    // left school: stop billing from this month
    if (period === "2026-09") for (const s of specs.filter((x) => x.special?.includes("left_aug"))) await core.students.setStudentStatus(admin, ids[s.adm]!, "left", "2026-08-31");
    if (period === "2026-08" && fixed) {
      for (const s of specs.filter((x) => x.special?.includes("left_refund"))) {
        await core.students.setStudentStatus(admin, ids[s.adm]!, "left", "2026-07-31");
        const left = (await core.payments.counterView(ids[s.adm]!)).wallet;
        if (left > 0) await core.payments.refund(admin, { studentId: ids[s.adm]!, amount: (left / 100).toFixed(2), mode: "cash", reason: "Left school in July: unused advance returned" });
      }
    }

    const run = await core.billing.generateInvoices({ period, dryRun: false });
    log(`${period}: ${run.created.length} bills`);

    for (const s of specs) {
      const sid = ids[s.adm];
      if (!sid) continue;
      const due = await owed(sid);
      switch (s.pay) {
        case "ontime": {
          // A cheque that bounces is still "on time"; the bounce is handled after this loop.
          const r = await pay(s, due, on(period, 8));
          if (r && s.special?.includes("cheque_bounce") && period === "2026-05") refs.bouncedPaymentId = r.paymentId;
          if (r && s.special?.includes("cancel_receipt") && period === "2026-06") refs.cancelledPaymentId = r.paymentId;
          break;
        }
        case "partial": if (due > 0) await pay(s, Math.floor(due / 200) * 100, on(period, 12)); break;
        case "quarterly": if (["2026-06", "2026-09", "2026-11"].includes(period)) await pay(s, due, on(period, 9)); break;
        case "stopped": if (i < 4) await pay(s, due, on(period, 8)); break;
        default: break; // late payers pay after the late fee run below; never/rte pay nothing
      }
    }

    // the daily job: late fees on the 20th
    await core.billing.applyLateFees(on(period, 20));
    for (const s of specs.filter((x) => x.pay === "late")) await pay(s, await owed(ids[s.adm]!), on(period, 25));

    // ---- one-off events
    if (period === "2026-05" && refs.bouncedPaymentId) {
      const chq = (await core.payments.listCheques("pending")).find((c) => c.c.paymentId === refs.bouncedPaymentId)!;
      await core.payments.chequeBounced(admin, { chequeId: chq.c.id, bounceCharge: "200" });
    }
    if (period === "2026-06" && fixed) {
      for (const c of await core.payments.listCheques("pending")) await core.payments.chequeCleared(admin, c.c.id);
      if (refs.cancelledPaymentId) await core.payments.cancelReceipt(admin, { paymentId: refs.cancelledPaymentId, reason: "Collected against the wrong student" });
      const s = specs.find((x) => x.special?.includes("cancel_receipt"))!;
      await pay(s, await owed(ids[s.adm]!), on(period, 9)); // collected again, correctly
    }
    if (period === "2026-07" && fixed) {
      const s = specs.find((x) => x.special?.includes("misc_paid"))!;
      const books = await core.billing.addMiscCharge(admin, { studentId: ids[s.adm]!, feeHeadId: head("BOOK_KHATA_DIARY"), description: "Books and diary", amount: "1,250.50", dueDate: "2026-07-15" });
      const uniform = await core.billing.addMiscCharge(admin, { studentId: ids[s.adm]!, feeHeadId: head("MISC"), description: "Uniform (ordered by mistake)", amount: "900", dueDate: "2026-07-15" });
      await core.billing.cancelInvoice(admin, { invoiceId: uniform.id, reason: "Uniform was not taken" });
      refs.cancelledMiscInvoiceId = uniform.id;
      // pays the books exactly, choosing that bill's line
      const [line] = await d.select().from(db.invoiceLines).where(db.dz.eq(db.invoiceLines.invoiceId, books.id));
      await core.payments.collectPayment({ studentId: ids[s.adm]!, amount: 125050, mode: "cash", date: "2026-07-16", allocations: [{ invoiceLineId: line!.id, amount: 125050 }] }, cashier);
      // the principal waives ₹500 of the July bill (still unpaid)
      const july = (await core.billing.listInvoices({ period: "2026-07", yearId: year.id })).find((x) => x.inv.studentId === ids[s.adm])!;
      await core.billing.issueCreditNote(admin, { invoiceId: july.inv.id, amount: "500", reason: "Waived by the principal" });
      refs.creditNoteInvoiceId = july.inv.id;
    }
    if (period === "2026-08" && fixed) {
      const s = specs.find((x) => x.special?.includes("tuition_only"))!;
      const lines = await d.select({ l: db.invoiceLines }).from(db.invoiceLines).innerJoin(db.invoices, db.dz.eq(db.invoices.id, db.invoiceLines.invoiceId))
        .where(db.dz.and(db.dz.eq(db.invoices.studentId, ids[s.adm]!), db.dz.eq(db.invoices.period, "2026-04"), db.dz.eq(db.invoiceLines.feeHeadId, head("TUITION"))));
      const l = lines[0]!.l;
      await core.payments.collectPayment({ studentId: ids[s.adm]!, amount: l.net, mode: "cash", date: "2026-08-03", allocations: [{ invoiceLineId: l.id, amount: l.net }] }, cashier);
      refs.tuitionOnlyLineId = l.id;
    }
  }

  // late fees up to today for whoever still owes
  await core.billing.applyLateFees("2026-11-19");
  log(`Loaded ${Object.keys(ids).length} test students.`);
  return { ids, admin, cashier, refs };
}

/**
 * Many random-but-repeatable students (same seed → same students every run) for volume testing.
 * Mix: on time 45%, late 15%, half 12%, never 10%, every 3 months 8%, stopped 7%, RTE 3%;
 * ~15% are younger brothers/sisters (10% sibling concession), 5% staff children, 15% join during the year.
 */
export function bulkSpecs(n: number, seed = 20261119): Spec[] {
  let x = seed >>> 0;
  const rnd = () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
  const first = ["Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir", "Ananya", "Diya", "Saanvi", "Aadhya", "Pari", "Myra", "Kiara", "Riya", "Navya", "Meera", "Tanvi", "Nisha", "Rahul", "Amit", "Sneha"];
  const last = ["Sharma", "Verma", "Gupta", "Singh", "Yadav", "Mishra", "Patel", "Das", "Roy", "Paul", "Mondal", "Saha", "Dey", "Ghosh", "Sen", "Nair", "Iyer", "Khan", "Ali", "Joshi"];
  const classes = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  const out: Spec[] = [];
  for (let i = 1; i <= n; i++) {
    const prev = out.at(-1);
    const sibling = !!prev && !prev.admitted && rnd() < 0.15;
    const r = rnd();
    const pay: Pay = r < 0.45 ? "ontime" : r < 0.6 ? "late" : r < 0.72 ? "partial" : r < 0.82 ? "never" : r < 0.9 ? "quarterly" : r < 0.97 ? "stopped" : "rte";
    const j = rnd();
    const admitted = sibling ? undefined : j < 0.05 ? "2026-04-01" : j < 0.15 ? `${pick(months)}-${String(1 + Math.floor(rnd() * 25)).padStart(2, "0")}` : undefined;
    const surname = sibling ? prev!.name.split(" ").at(-1)! : pick(last);
    const family = sibling ? (prev!.family ??= `f${i - 1}`) : undefined;
    const concession = pay === "rte" ? "RTE" as const : sibling ? "Sibling" as const : rnd() < 0.05 ? "Staff ward" as const : undefined;
    const m = rnd();
    out.push({
      adm: `B${String(i).padStart(4, "0")}`, name: `${pick(first)} ${surname}`, cls: pick(classes), section: rnd() < 0.5 ? "A" : "B",
      admitted, pay, family, concession, mode: m < 0.6 ? "cash" : m < 0.9 ? "upi" : "cheque", noConsent: rnd() < 0.05,
      story: `${pay}${admitted ? ` · joined ${admitted}` : ""}${concession ? ` · ${concession}` : ""}${family ? ` · family ${family}` : ""}`,
    });
  }
  return out;
}
