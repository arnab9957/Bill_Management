/**
 * A year-end promotion round on the test school (the 50 students of scenarios.ts), as the daily job
 * would do it on 2 April 2027, followed by the corrections a school makes on student profiles.
 * Used by test/promotion-round.test.ts and scenarios/load-promotion-round.ts (test school).
 */
import * as core from "../src";
import * as db from "@sb/db";

export const PROMOTION_DAY = "2027-04-02";

/** What the school corrects on the profile after automatic promotion. */
export const CORRECTIONS: { adm: string; action: "repeat" | "leave" | "promote"; why: string }[] = [
  { adm: "S2006", action: "repeat", why: "Failed Class III: repeats Class III" },
  { adm: "S2024", action: "repeat", why: "Failed UKG and owes money: repeats UKG, dues stay with her" },
  { adm: "S2010", action: "leave", why: "Family moved away: left school" },
  { adm: "S2031", action: "leave", why: "Never paid and left: dues remain collectable" },
  { adm: "S2025", action: "repeat", why: "Marked failed by mistake…" },
  { adm: "S2025", action: "promote", why: "…corrected: promoted after all" },
];

export interface RoundResult {
  before: Map<string, string>;
  checkedEarly: boolean;
  promoted: { from: string; to: string; done: { className: string; toName: string; students: number }[] }[];
  corrections: { adm: string; why: string; result: string }[];
  aprilBills: number;
  lateChange: string;
}

const classIn = async (sid: number, yearName: string) => (await core.students.listEnrollments(sid)).find((e) => e.yearName === yearName);

export async function promotionRound(ids: Record<string, number>, log: (s: string) => void = () => {}): Promise<RoundResult> {
  const [adminRow] = await db.getDb().select().from(db.users).where(db.dz.eq(db.users.username, "admin"));
  const admin: core.Actor = { id: adminRow!.id, role: "ADMIN", username: "admin", fullName: adminRow!.fullName };
  const before = new Map<string, string>();
  for (const [adm, sid] of Object.entries(ids)) before.set(adm, (await classIn(sid, "2026-27"))?.className ?? "-");

  // 1. Today the sessions are still running: the daily job does nothing.
  const checkedEarly = !(await core.students.anyClassReadyToPromote("2026-11-21"));
  log(`21 Nov 2026: any class ready? ${checkedEarly ? "no, sessions still running - nothing happens" : "YES (unexpected)"}`);

  // 2. The morning of 2 April 2027: the daily job runs.
  const promoted = await core.students.autoPromoteAll(PROMOTION_DAY);
  for (const p of promoted) log(`${PROMOTION_DAY}: ${p.from} → ${p.to}: ${p.done.map((d) => `${d.className}→${d.toName} (${d.students})`).join(", ")}`);
  const y2 = (await core.fees.masters()).years.find((y) => y.name === "2027-28")!;
  const y1 = (await core.fees.masters()).years.find((y) => y.name === "2026-27")!;

  // 3. The school checks and fixes a few students on their profile.
  const corrections: RoundResult["corrections"] = [];
  for (const c of CORRECTIONS) {
    try {
      const r = await core.students.changePromotion(admin, { studentId: ids[c.adm]!, fromYearId: y1.id, toYearId: y2.id, action: c.action });
      corrections.push({ adm: c.adm, why: c.why, result: r.now });
    } catch (e) { corrections.push({ adm: c.adm, why: c.why, result: `REFUSED: ${(e as Error).message}` }); }
    log(`  ${c.adm} ${c.why} → ${corrections.at(-1)!.result}`);
  }

  // 4. 1 April-session bills are made; after that, changes are refused with a clear message.
  const run = await core.billing.generateInvoices({ period: "2027-04", dryRun: false });
  log(`April 2027 bill run: ${run.created.length} bills`);
  let lateChange = "";
  try { await core.students.changePromotion(admin, { studentId: ids.S2001!, fromYearId: y1.id, toYearId: y2.id, action: "repeat" }); lateChange = "allowed (unexpected)"; }
  catch (e) { lateChange = (e as Error).message; }
  log(`Trying to mark S2001 failed after the April bill: ${lateChange}`);
  return { before, checkedEarly, promoted, corrections, aprilBills: run.created.length, lateChange };
}

/** One line per student: class before → after, status, dues carried, April bill. */
export async function roundReport(ids: Record<string, number>, specs: { adm: string; name: string; story: string }[]) {
  const d = db.getDb();
  const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;
  const lines: string[] = ["Adm.   Name                2026-27      →  2027-28             Carried   Apr 2027 bill   Story"];
  for (const s of specs) {
    const sid = ids[s.adm]!;
    const hist = await core.students.listEnrollments(sid);
    const a = hist.find((h) => h.yearName === "2026-27");
    const b = hist.find((h) => h.yearName === "2027-28");
    const [stu] = await d.select().from(db.students).where(db.dz.eq(db.students.id, sid));
    const inv = await d.select().from(db.invoices).where(db.dz.eq(db.invoices.studentId, sid));
    const opening = inv.find((i) => i.period === "OPENING" && b && i.academicYearId === b.e.academicYearId);
    const apr = inv.find((i) => i.period === "2027-04" && i.status !== "cancelled");
    const after = b ? `${b.className.padEnd(8)} ${b.e.status === "studying" ? (b.e.classId === a?.e.classId ? "(repeat)" : "") : b.e.status}`
      : stu!.status === "alumni" ? "passed out" : stu!.status === "left" ? "left earlier" : "-";
    lines.push(`${s.adm}  ${s.name.padEnd(18)}  ${(a?.className ?? "-").padEnd(8)} ${a?.e.status.padEnd(9) ?? ""} →  ${after.padEnd(18)}  ${(opening ? rupees(opening.net + opening.credited) : "-").padEnd(8)}  ${(apr ? rupees(apr.net) : "no bill").padEnd(14)}  ${s.story}`);
  }
  return lines.join("\n");
}
