import { eq } from "drizzle-orm";
import { getDb, getPool } from "./client";
import * as s from "./schema";
import { loadProfile } from "./profile";
import { provisionSchool } from "./provision";

// Development database. Loads the demo school profile (profiles/dev-demo.json); with --demo also adds
// demo students, fee structures and a transport route. Safe to run again: it only fills in what is missing.
const db = getDb();
const demo = process.argv.includes("--demo");

const result = await provisionSchool(db, loadProfile("profiles/dev-demo.json"), {
  overwrite: false, adminUsername: "admin", adminPassword: "admin12345", adminFullName: "Administrator",
});
if (result.adminCreated) console.log("Created user admin / admin12345 (must change on first login)");
const currentYear = (await db.select().from(s.academicYears).where(eq(s.academicYears.isCurrent, true)))[0]!;

if (demo) {
  const allHeads = await db.select().from(s.feeHeads);
  const head = (code: string) => allHeads.find((h) => h.code === code)!.id;
  const allClasses = await db.select().from(s.classes);
  for (const c of allClasses) {
    const [st] = await db.insert(s.feeStructures).values({ academicYearId: currentYear.id, classId: c.id }).onConflictDoNothing().returning();
    if (!st) continue;
    const base = 150000 + c.sortOrder * 10000; // ₹1,500 + ₹100 per class step
    await db.insert(s.feeStructureItems).values([
      { structureId: st.id, feeHeadId: head("TUITION"), amount: base, frequency: "monthly", dueDay: 10 },
      { structureId: st.id, feeHeadId: head("ANNUAL"), amount: 500000, frequency: "annual", dueDay: 15 },
      { structureId: st.id, feeHeadId: head("EXAM"), amount: 60000, frequency: "half_yearly", dueDay: 10 },
      { structureId: st.id, feeHeadId: head("ADMISSION"), amount: 1000000, frequency: "one_time", dueDay: 10 },
    ]);
  }
  await db.insert(s.transportRoutes).values({ name: "Route 1 – City Centre", stops: "Market, Station, Park", monthlyFee: 80000 }).onConflictDoNothing();
  await db.insert(s.concessionTypes).values([
    { name: "Sibling", kind: "percent", value: 1000, feeHeadId: head("TUITION") },
    { name: "Staff ward", kind: "percent", value: 5000, feeHeadId: head("TUITION") },
    { name: "RTE", kind: "percent", value: 10000, feeHeadId: null },
  ]).onConflictDoNothing();

  const cls = allClasses.find((c) => c.name === "V")!;
  const existing = await db.select().from(s.students).where(eq(s.students.admissionNo, "A1001"));
  if (existing.length === 0) {
    const [g] = await db.insert(s.guardians).values({
      name: "Ramesh Kumar", mobile: "9876500001", whatsappNo: "9876500001", email: "ramesh@example.com", messagingConsent: true,
    }).returning();
    for (const [i, nm] of ["Anita Kumar", "Rohit Kumar"].entries()) {
      const [stu] = await db.insert(s.students).values({
        admissionNo: `A100${i + 1}`, name: nm, classId: cls.id, admissionDate: "2026-04-01", rollNo: String(i + 1),
      }).returning();
      await db.insert(s.studentGuardians).values({ studentId: stu!.id, guardianId: g!.id, isPrimary: true });
      await db.insert(s.studentEnrollments).values({ studentId: stu!.id, academicYearId: currentYear.id, classId: cls.id, rollNo: String(i + 1) });
    }
    console.log("Demo students A1001, A1002 created (siblings).");
  }
}

console.log("Seed complete.");
await getPool().end();
