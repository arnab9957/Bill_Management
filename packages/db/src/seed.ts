/**
 * Seeds the minimum data a fresh install needs, idempotently:
 *   school settings, an admin user, current academic year, classes/sections,
 *   standard fee heads and English notification templates.
 * Pass --demo to also create a sample fee structure and a few students.
 */
import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "./client";
import * as s from "./schema";

const db = getDb();
const demo = process.argv.includes("--demo");

await db.insert(s.schoolSettings).values({ id: 1, name: "Demo Public School", phone: "9876543210" }).onConflictDoNothing();

const adminExists = await db.select().from(s.users).where(eq(s.users.username, "admin"));
if (adminExists.length === 0) {
  await db.insert(s.users).values({
    username: "admin", fullName: "Administrator", role: "ADMIN",
    passwordHash: await hash("admin12345"), mustChangePassword: true,
  });
  console.log("Created user admin / admin12345 (must change on first login)");
}

const [year] = await db.insert(s.academicYears)
  .values({ name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31", isCurrent: true })
  .onConflictDoNothing().returning();
const currentYear = year ?? (await db.select().from(s.academicYears).where(eq(s.academicYears.isCurrent, true)))[0]!;

const classNames = ["Nursery", "LKG", "UKG", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
for (const [i, name] of classNames.entries()) {
  const [c] = await db.insert(s.classes).values({ name, sortOrder: i }).onConflictDoNothing().returning();
  if (c) await db.insert(s.sections).values([{ classId: c.id, name: "A" }, { classId: c.id, name: "B" }]).onConflictDoNothing();
}

const heads: (typeof s.feeHeads.$inferInsert)[] = [
  { code: "TUITION", name: "Tuition Fee", type: "recurring", sortOrder: 1 },
  { code: "ADMISSION", name: "Admission Fee", type: "one_time", sortOrder: 2 },
  { code: "ANNUAL", name: "Annual Charges", type: "recurring", sortOrder: 3 },
  { code: "EXAM", name: "Examination Fee", type: "recurring", sortOrder: 4 },
  { code: "COMPUTER", name: "Computer Fee", type: "recurring", sortOrder: 5 },
  { code: "LAB", name: "Lab Fee", type: "recurring", sortOrder: 6 },
  { code: "TRANSPORT", name: "Transport Fee", type: "optional", sortOrder: 7 },
  { code: "CAUTION", name: "Caution Money", type: "one_time", isRefundable: true, sortOrder: 8 },
  { code: "LATE_FEE", name: "Late Fee", type: "optional", sortOrder: 90 },
  { code: "MISC", name: "Miscellaneous", type: "optional", sortOrder: 91 },
  { code: "OPENING", name: "Opening Balance", type: "optional", sortOrder: 92 },
  { code: "BOUNCE", name: "Cheque Bounce Charge", type: "optional", sortOrder: 93 },
];
await db.insert(s.feeHeads).values(heads).onConflictDoNothing();

type T = typeof s.notificationTemplates.$inferInsert;
const sign = "– {school_name}, {school_phone}";
const tpl: T[] = [];
const add = (event: T["event"], sms: string, wa: string, subject: string, email: string) => {
  tpl.push({ event, channel: "sms", body: `${sms} ${sign}` });
  tpl.push({ event, channel: "whatsapp", body: `${wa}\n${sign}` });
  tpl.push({ event, channel: "email", subject, body: `${email}\n\nRegards,\n{school_name}\n{school_phone}` });
};
add("BILL_GENERATED",
  "Dear {guardian_name}, fee bill {invoice_no} of Rs.{amount_due} for {student_name} ({class}) is due on {due_date}.",
  "Dear {guardian_name}, the fee bill {invoice_no} for {student_name} ({class}) is ready.\nAmount: ₹{amount_due}\nDue date: {due_date}",
  "Fee bill {invoice_no} for {student_name}",
  "Dear {guardian_name},\n\nThe fee bill {invoice_no} for {student_name} ({class}) of ₹{amount_due} has been generated and is due on {due_date}.");
add("DUE_UPCOMING",
  "Dear {guardian_name}, fee of Rs.{amount_due} for {student_name} is due on {due_date}. Please ignore if already paid.",
  "Dear {guardian_name}, a gentle reminder: fee of ₹{amount_due} for {student_name} is due on {due_date}.\n{dues_detail}\nPlease ignore if already paid.",
  "Fee due on {due_date}",
  "Dear {guardian_name},\n\nThis is a reminder that fees of ₹{amount_due} are due on {due_date}.\n\n{dues_detail}\n\nPlease ignore if already paid.");
add("DUE_TODAY",
  "Dear {guardian_name}, fee of Rs.{amount_due} for {student_name} is due today. Please ignore if already paid.",
  "Dear {guardian_name}, fee of ₹{amount_due} for {student_name} is due today ({due_date}).\n{dues_detail}\nPlease ignore if already paid.",
  "Fee due today",
  "Dear {guardian_name},\n\nFees of ₹{amount_due} are due today ({due_date}).\n\n{dues_detail}\n\nPlease ignore if already paid.");
add("OVERDUE",
  "Dear {guardian_name}, fee of Rs.{amount_due} for {student_name} is overdue since {due_date}. Kindly pay at the earliest.",
  "Dear {guardian_name}, fee of ₹{amount_due} for {student_name} is OVERDUE since {due_date}.\n{dues_detail}\nKindly pay at the earliest to avoid late fees.",
  "Overdue fees for {student_name}",
  "Dear {guardian_name},\n\nFees of ₹{amount_due} are overdue since {due_date}.\n\n{dues_detail}\n\nKindly pay at the earliest to avoid late fees. Please ignore if already paid.");
add("PAYMENT_RECEIVED",
  "Received Rs.{amount_paid} for {student_name}, receipt {receipt_no}. Balance Rs.{balance}. Thank you.",
  "Dear {guardian_name}, we have received ₹{amount_paid} for {student_name}.\nReceipt: {receipt_no}\nRemaining balance: ₹{balance}\nThank you.",
  "Payment received – receipt {receipt_no}",
  "Dear {guardian_name},\n\nWe have received ₹{amount_paid} towards fees for {student_name}. Receipt number {receipt_no}. Remaining balance: ₹{balance}.\n\nThank you.");
add("CHEQUE_BOUNCED",
  "Dear {guardian_name}, cheque {cheque_no} for {student_name} has bounced. Charge Rs.{bounce_charge} added. Please pay by another mode.",
  "Dear {guardian_name}, cheque {cheque_no} towards fees of {student_name} has bounced. A charge of ₹{bounce_charge} has been added. Please pay by another mode.",
  "Cheque {cheque_no} bounced",
  "Dear {guardian_name},\n\nCheque {cheque_no} towards fees of {student_name} was returned unpaid by the bank. A charge of ₹{bounce_charge} has been added. Please pay the dues by another mode.");
add("LATE_FEE_APPLIED",
  "Dear {guardian_name}, a late fee of Rs.{late_fee} was added to {invoice_no} for {student_name}. Balance Rs.{amount_due}.",
  "Dear {guardian_name}, a late fee of ₹{late_fee} has been added to bill {invoice_no} for {student_name}. Total due now: ₹{amount_due}.",
  "Late fee applied – {invoice_no}",
  "Dear {guardian_name},\n\nA late fee of ₹{late_fee} has been added to bill {invoice_no} for {student_name}. Total due now: ₹{amount_due}.");
await db.insert(s.notificationTemplates).values(tpl).onConflictDoNothing();

await db.insert(s.lateFeeRules)
  .values({ academicYearId: currentYear.id, graceDays: 5, kind: "per_day", amount: 1000, maxCap: 50000 })
  .onConflictDoNothing();

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
