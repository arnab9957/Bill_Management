/**
 * Small sample to SEE how sessions and promotion work: 3 sessions (Jan 2024 - Nov 2026), 15 students, new admissions
 * every session, and 4 promotion rounds. Nursery/LKG/UKG run January-December; Classes I-III run April-March.
 *
 *   Session         Nursery, LKG, UKG          Classes I, II, III
 *   2024-25         Jan 2024 - Dec 2024        Apr 2024 - Mar 2025
 *   2025-26         Jan 2025 - Dec 2025        Apr 2025 - Mar 2026
 *   2026-27         Jan 2026 - Dec 2026        Apr 2026 - Mar 2027   (current; played up to Nov 2026)
 *
 * Needs a database made with `seed.ts --demo`. Used by session-sample.cmd and test/session-sample.test.ts.
 */
import * as core from "../src";
import * as db from "@sb/db";

type Pay = "full" | "half" | "never";
export interface SampleStudent { adm: string; name: string; cls: string; joined: string; pay: Pay; story: string }

export const STUDENTS: SampleStudent[] = [
  // ---- start of 2024-25
  { adm: "P01", name: "Asha Roy", cls: "Nursery", joined: "2024-01-05", pay: "full", story: "Nursery 2024 → LKG 2025 → UKG 2026. Promoted every December, always pays." },
  { adm: "P02", name: "Bablu Sen", cls: "Nursery", joined: "2024-01-05", pay: "full", story: "FAILED Nursery in Dec 2024: repeats Nursery in 2025, then LKG in 2026." },
  { adm: "P03", name: "Chinu Das", cls: "Nursery", joined: "2024-01-05", pay: "full", story: "LEFT school at the Dec 2024 promotion: no bills after Dec 2024." },
  { adm: "P04", name: "Dolly Ghosh", cls: "Nursery", joined: "2024-01-05", pay: "never", story: "Never pays: unpaid dues are CARRIED into each new session as an 'Opening balance' bill." },
  { adm: "P05", name: "Esha Paul", cls: "LKG", joined: "2024-01-08", pay: "full", story: "LKG 2024 → UKG 2025 → Class I from April 2026. No bills Jan-Mar 2026 (gap between UKG ending Dec and Class I starting Apr)." },
  { adm: "P06", name: "Mohan Saha", cls: "UKG", joined: "2024-01-08", pay: "full", story: "UKG 2024 → Class I from April 2025 (gap Jan-Mar 2025) → Class II from April 2026." },
  { adm: "P07", name: "Farhan Ali", cls: "I", joined: "2024-04-02", pay: "full", story: "Class I → II (Apr 2025) → III (Apr 2026). Promoted every March." },
  { adm: "P08", name: "Gita Mondal", cls: "I", joined: "2024-04-02", pay: "half", story: "Pays only half: dues carried into 2025-26 and 2026-27." },
  { adm: "P09", name: "Hari Dey", cls: "II", joined: "2024-04-02", pay: "full", story: "FAILED Class II in Mar 2025: repeats Class II, then Class III in 2026." },
  { adm: "P10", name: "Rina Kar", cls: "III", joined: "2024-04-02", pay: "full", story: "Class III → Class IV in Apr 2025; Class IV has no fees set in this sample, so she is not billed afterwards (shows the 'no fees' warning)." },
  // ---- new admissions during the years
  { adm: "P11", name: "Ishaan Bose", cls: "Nursery", joined: "2024-06-10", pay: "full", story: "NEW ADMISSION mid-session (June 2024): first bill June with admission + annual fee; then promoted with the class." },
  { adm: "P12", name: "Jaya Nandi", cls: "I", joined: "2025-07-15", pay: "full", story: "NEW ADMISSION in July 2025 into Class I; promoted to II in April 2026." },
  { adm: "P13", name: "Kabir Pal", cls: "Nursery", joined: "2026-01-06", pay: "full", story: "NEW ADMISSION at the start of the Nursery 2026 session (January 2026)." },
  { adm: "P14", name: "Lina Basu", cls: "LKG", joined: "2026-08-04", pay: "half", story: "NEW ADMISSION in August 2026 into LKG; pays half." },
  { adm: "P15", name: "Nisha Guha", cls: "II", joined: "2026-04-01", pay: "full", story: "NEW ADMISSION at the start of the Class II 2026-27 session (April 2026)." },
];

/** Who goes where at each promotion round (default for students not listed: promote). */
const ROUNDS: { when: string; from: string; to: string; classes: string[]; special: Record<string, core.students.PromoteAction> }[] = [
  { when: "2024-12", from: "2024-25", to: "2025-26", classes: ["UKG", "LKG", "Nursery"], special: { P02: "repeat", P03: "leave" } },
  { when: "2025-03", from: "2024-25", to: "2025-26", classes: ["III", "II", "I"], special: { P09: "repeat" } },
  { when: "2025-12", from: "2025-26", to: "2026-27", classes: ["UKG", "LKG", "Nursery"], special: {} },
  { when: "2026-03", from: "2025-26", to: "2026-27", classes: ["III", "II", "I"], special: {} },
];
const MONTHS: string[] = [];
for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) { const p = `${y}-${String(m).padStart(2, "0")}`; if (p <= "2026-11") MONTHS.push(p); }

export async function loadSessionSample(log: (s: string) => void = () => {}) {
  const d = db.getDb();
  const [adminRow] = await d.select().from(db.users).where(db.dz.eq(db.users.username, "admin"));
  const admin: core.Actor = { id: adminRow!.id, role: "ADMIN", username: "admin", fullName: adminRow!.fullName };
  let [cashRow] = await d.select().from(db.users).where(db.dz.eq(db.users.username, "cashier1"));
  if (!cashRow) {
    const u = await core.accounts.createUser(admin, { username: "cashier1", fullName: "Counter Cashier", role: "CASHIER", password: "cashier12345" });
    [cashRow] = await d.select().from(db.users).where(db.dz.eq(db.users.id, u.id));
  }
  const cashier: core.Actor = { id: cashRow!.id, role: "CASHIER", username: "cashier1", fullName: cashRow!.fullName };

  // ---- three academic years; 2026-27 comes from the demo seed
  let m = await core.fees.masters();
  const y26 = m.years.find((y) => y.name === "2026-27")!;
  for (const [name, s, e] of [["2024-25", "2024-04-01", "2025-03-31"], ["2025-26", "2025-04-01", "2026-03-31"]] as const) {
    if (!m.years.some((y) => y.name === name)) await core.fees.createYear(admin, { name, startDate: s, endDate: e });
  }
  m = await core.fees.masters();
  const year = (n: string) => m.years.find((y) => y.name === n)!;
  const cls = (n: string) => m.classes.find((c) => c.name === n)!.id;
  // Fees: same as 2026-27, 10% less each year back. Class IV gets no fees in the old years (to show the warning).
  await core.fees.copyStructures(admin, y26.id, year("2025-26").id, -9.1);
  await core.fees.copyStructures(admin, y26.id, year("2024-25").id, -17.4);
  for (const yn of ["2024-25", "2025-26", "2026-27"]) {
    const [st] = await d.select().from(db.feeStructures).where(db.dz.and(db.dz.eq(db.feeStructures.academicYearId, year(yn).id), db.dz.eq(db.feeStructures.classId, cls("IV"))));
    if (st) await d.delete(db.feeStructureItems).where(db.dz.eq(db.feeStructureItems.structureId, st.id));
  }
  // Nursery-UKG run January-December (set oldest first so sessions never overlap)
  for (const [yn, yr] of [["2024-25", 2024], ["2025-26", 2025], ["2026-27", 2026]] as const) {
    for (const c of ["Nursery", "LKG", "UKG"]) await core.sessions.saveClassSession(admin, { yearId: year(yn).id, classId: cls(c), startDate: `${yr}-01-01`, endDate: `${yr}-12-31` });
  }
  log("Years 2024-25, 2025-26, 2026-27 ready; Nursery-UKG on January-December sessions.");

  const ids: Record<string, number> = {};
  let phone = 9830000000;
  const admit = async (s: SampleStudent) => {
    // Admitted into the session that covers the joining date for that class.
    const yn = ["2024-25", "2025-26", "2026-27"].find((n) => {
      const ses = { Nursery: 1, LKG: 1, UKG: 1 }[s.cls as "Nursery"] ? { start: `${n.slice(0, 4)}-01-01`, end: `${n.slice(0, 4)}-12-31` } : { start: year(n).startDate, end: year(n).endDate };
      return s.joined >= ses.start && s.joined <= ses.end;
    })!;
    const st = await core.students.admitStudent(admin, {
      admissionNo: s.adm, name: s.name, classId: cls(s.cls), sectionId: m.sections.find((x) => x.classId === cls(s.cls) && x.name === "A")?.id,
      rollNo: s.adm.slice(1), admissionDate: s.joined, academicYearId: year(yn).id,
      guardian: { name: `Parent of ${s.name.split(" ")[0]}`, mobile: String(++phone), whatsappNo: String(phone), messagingConsent: "on" },
    });
    ids[s.adm] = st.id;
    log(`  ${s.joined}: admitted ${s.adm} ${s.name} into ${s.cls} (${yn})`);
  };

  for (const period of MONTHS) {
    for (const s of STUDENTS) if (s.joined.slice(0, 7) === period) await admit(s);
    await core.billing.generateInvoices({ period, dryRun: false });
    for (const s of STUDENTS) {
      const sid = ids[s.adm];
      if (!sid || s.pay === "never") continue;
      const owed = (await core.payments.counterView(sid)).total;
      const amt = s.pay === "full" ? owed : Math.floor(owed / 200) * 100;
      if (amt > 0) await core.payments.collectPayment({ studentId: sid, amount: amt, mode: "cash", date: `${period}-08` }, cashier);
    }
    for (const r of ROUNDS.filter((x) => x.when === period)) {
      for (const c of r.classes) {
        const list = (await core.students.promotionList(year(r.from).id, cls(c), year(r.to).id)).filter((x) => x.canPromote);
        if (!list.length) continue;
        const ordered = m.classes.slice().sort((a, b) => a.sortOrder - b.sortOrder);
        const next = core.students.nextClassOf(ordered, cls(c));
        const res = await core.students.promoteStudents(admin, {
          fromYearId: year(r.from).id, toYearId: year(r.to).id, classId: cls(c), toClassId: next ?? "alumni", rollMode: "keep",
          decisions: list.map((x) => ({ studentId: x.studentId, action: r.special[x.admissionNo] ?? "promote" })),
        });
        log(`  ${period}: promoted ${c} ${r.from} → ${r.to}: ${JSON.stringify({ promoted: res.promoted, repeated: res.repeated, left: res.left, carried: res.carried })}`);
      }
    }
  }
  log("Played January 2024 to November 2026.");
  return { ids, admin, cashier, year, cls };
}

/** Plain-text story per student, from what is actually in the database. */
export async function sampleReport(ids: Record<string, number>): Promise<string> {
  const d = db.getDb();
  const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: 0 })}`;
  const out: string[] = [];
  for (const s of STUDENTS) {
    const sid = ids[s.adm]!;
    const [stu] = await d.select().from(db.students).where(db.dz.eq(db.students.id, sid));
    out.push(`\n${s.adm}  ${s.name}  (joined ${s.joined}, pays: ${s.pay}, now: ${stu!.status})`);
    out.push(`     ${s.story}`);
    const enr = await core.students.listEnrollments(sid);
    const inv = await d.select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, sid));
    for (const e of enr) {
      const ses = await core.sessions.sessionOf(d, e.e.academicYearId, e.e.classId);
      const mine = inv.filter((i) => i.academicYearId === e.e.academicYearId && i.status !== "cancelled");
      const monthly = mine.filter((i) => /^\d{4}-\d{2}$/.test(i.period)).sort((a, b) => a.period.localeCompare(b.period));
      const opening = mine.find((i) => i.period === "OPENING");
      const months = monthly.length ? `${monthly[0]!.period} … ${monthly.at(-1)!.period} (${monthly.length} bills)` : "no bills";
      out.push(`     ${e.yearName.padEnd(8)} Class ${e.className.padEnd(8)} session ${ses.startDate} → ${ses.endDate}   ${e.e.status.padEnd(10)} bills: ${months}`);
      out.push(`              billed ${rupees(mine.reduce((a, i) => a + i.net + i.credited, 0))}, paid ${rupees(mine.reduce((a, i) => a + i.paid, 0))}, still due ${rupees(mine.reduce((a, i) => a + i.balance, 0))}${opening ? `   (incl. ${rupees(opening.net + opening.credited)} carried in from the year before)` : ""}`);
    }
    out.push(`     Owes now: ${rupees((await core.payments.counterView(sid)).total)}`);
  }
  return out.join("\n");
}
