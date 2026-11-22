import { count, eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import type { SchoolProfile } from "@sb/validation";
import type { DB } from "./client";
import * as s from "./schema";
import { defaultTemplates } from "./templates";

export interface ProvisionOptions {
  /**
   * true  = a new school: the profile replaces the defaults (used by `pnpm new-school`).
   * false = only fill in what is missing, so it is safe to run again (used by `pnpm db:seed`).
   */
  overwrite: boolean;
  adminUsername: string;
  adminPassword: string;
  adminFullName: string;
}

export interface ProvisionResult {
  adminUsername: string;
  adminCreated: boolean;
  year: string;
  classes: number;
  feeHeads: number;
  receiptNext: string;
}

/** Fee heads the software itself relies on. Created for every school unless its profile lists the same code. */
export const SYSTEM_HEADS = [
  { code: "TRANSPORT", name: "Transport Fee", type: "optional" as const, sortOrder: 95 },
  { code: "LATE_FEE", name: "Late Fee", type: "optional" as const, sortOrder: 96 },
  { code: "MISC", name: "Miscellaneous", type: "optional" as const, sortOrder: 97 },
  { code: "OPENING", name: "Opening Balance", type: "optional" as const, sortOrder: 98 },
  { code: "BOUNCE", name: "Cheque Bounce Charge", type: "optional" as const, sortOrder: 99 },
];

/** Write a school profile into the database: settings, academic year, classes, fee heads, receipt numbering, templates, admin. */
export async function provisionSchool(db: DB, p: SchoolProfile, o: ProvisionOptions): Promise<ProvisionResult> {
  return db.transaction(async (tx) => {
    const yearName = p.academicYear.name;

    // 1. School settings (single row)
    const settings = {
      name: p.school.name, address: p.school.address, phone: p.school.phone, email: p.school.email,
      upiId: p.school.upiId || null, invoicePrefix: p.bills.prefix, receiptPrefix: p.receipts.prefix,
      quietStart: p.reminders.quietStart, quietEnd: p.reminders.quietEnd,
      reminderDaysBefore: p.reminders.daysBefore, overdueSteps: p.reminders.overdueSteps,
      headerSubtitle: p.school.headerSubtitle, udiseCode: p.school.udiseCode, registrationNote: p.school.registrationNote,
      receiptIncludeYear: p.receipts.numbering === "per_year", receiptDigits: p.receipts.digits,
      dayCloseEnabled: p.features.counterClosing, concessionsEnabled: p.features.concessions,
    };
    const settingsInsert = tx.insert(s.schoolSettings).values({ id: 1, ...settings });
    if (o.overwrite) await settingsInsert.onConflictDoUpdate({ target: s.schoolSettings.id, set: settings });
    else await settingsInsert.onConflictDoNothing();

    // 2. Academic year. It becomes the current year when none is current, or always when overwriting.
    await tx.insert(s.academicYears).values({ name: yearName, startDate: p.academicYear.startDate, endDate: p.academicYear.endDate }).onConflictDoNothing();
    if (o.overwrite) {
      await tx.update(s.academicYears).set({ startDate: p.academicYear.startDate, endDate: p.academicYear.endDate }).where(eq(s.academicYears.name, yearName));
    }
    const [anyCurrent] = await tx.select({ id: s.academicYears.id }).from(s.academicYears).where(eq(s.academicYears.isCurrent, true));
    if (o.overwrite || !anyCurrent) {
      await tx.update(s.academicYears).set({ isCurrent: false }).where(eq(s.academicYears.isCurrent, true));
      await tx.update(s.academicYears).set({ isCurrent: true }).where(eq(s.academicYears.name, yearName));
    }
    const [year] = await tx.select().from(s.academicYears).where(eq(s.academicYears.name, yearName));

    // 3. Classes (in the order listed) and their sections
    for (const [i, c] of p.classes.entries()) {
      const sortOrder = (i + 1) * 10;
      await tx.insert(s.classes).values({ name: c.name, sortOrder }).onConflictDoNothing();
      const [cls] = await tx.select().from(s.classes).where(eq(s.classes.name, c.name));
      if (o.overwrite) await tx.update(s.classes).set({ sortOrder }).where(eq(s.classes.id, cls!.id));
      for (const sec of c.sections) await tx.insert(s.sections).values({ classId: cls!.id, name: sec }).onConflictDoNothing();
    }

    // 4. Fee heads: the school's list, plus the system heads the school's list does not already define
    const listed = new Set(p.feeHeads.map((h) => h.code));
    const heads = [
      ...p.feeHeads.map((h, i) => ({
        code: h.code, name: h.name, type: h.type, isRefundable: h.isRefundable, sortOrder: 10 + i,
        receiptOrder: h.receiptOrder, receiptLabel: h.receiptLabel,
      })),
      ...SYSTEM_HEADS.filter((h) => !listed.has(h.code)).map((h) => ({
        code: h.code, name: h.name, type: h.type, isRefundable: false, sortOrder: h.sortOrder, receiptOrder: null, receiptLabel: null,
      })),
    ];
    for (const h of heads) {
      const q = tx.insert(s.feeHeads).values(h);
      if (o.overwrite) {
        await q.onConflictDoUpdate({
          target: s.feeHeads.code,
          set: { name: h.name, type: h.type, isRefundable: h.isRefundable, sortOrder: h.sortOrder, receiptOrder: h.receiptOrder, receiptLabel: h.receiptLabel },
        });
      } else {
        await q.onConflictDoNothing();
      }
    }

    // 5. Late-fee rule for the year (none if the profile says null)
    if (p.lateFee) {
      const lf = {
        academicYearId: year!.id, graceDays: p.lateFee.graceDays, kind: p.lateFee.kind,
        amount: Math.round(p.lateFee.amount * 100), maxCap: Math.round(p.lateFee.maxCap * 100), isActive: true,
      };
      const q = tx.insert(s.lateFeeRules).values(lf);
      if (o.overwrite) {
        await q.onConflictDoUpdate({ target: s.lateFeeRules.academicYearId, set: { graceDays: lf.graceDays, kind: lf.kind, amount: lf.amount, maxCap: lf.maxCap, isActive: true } });
      } else {
        await q.onConflictDoNothing();
      }
    }

    // 6. Receipt numbering: the first number the school will issue
    const nextNo = p.receipts.nextNumber;
    const seriesKey = p.receipts.numbering === "per_year" ? `RECEIPT:${p.receipts.prefix}:${yearName}` : `RECEIPT:${p.receipts.prefix}`;
    const series = tx.insert(s.numberSeries).values({ key: seriesKey, lastValue: nextNo - 1, startValue: nextNo });
    if (o.overwrite) {
      await series.onConflictDoUpdate({ target: s.numberSeries.key, set: { lastValue: nextNo - 1, startValue: nextNo } });
    } else {
      await series.onConflictDoNothing();
    }

    // 7. Default message texts
    await tx.insert(s.notificationTemplates).values(defaultTemplates()).onConflictDoNothing();

    // 8. The first administrator (only when there are no users yet)
    const [anyUser] = await tx.select({ id: s.users.id }).from(s.users).limit(1);
    const adminCreated = !anyUser;
    const adminUsername = o.adminUsername.trim().toLowerCase();
    if (adminCreated) {
      await tx.insert(s.users).values({
        username: adminUsername, fullName: o.adminFullName, role: "ADMIN",
        passwordHash: await hash(o.adminPassword), mustChangePassword: true,
      });
    }

    await tx.insert(s.auditLog).values({
      userId: null, action: o.overwrite ? "setup" : "seed", tableName: "school_settings", recordId: "1",
      newValues: { profile: p.profileName, year: yearName },
    });

    const [classRow] = await tx.select({ n: count() }).from(s.classes);
    const [headRow] = await tx.select({ n: count() }).from(s.feeHeads);
    const classCount = Number(classRow?.n ?? 0);
    const headCount = Number(headRow?.n ?? 0);
    const digits = String(nextNo).padStart(p.receipts.digits, "0");
    const receiptNext = [p.receipts.prefix, p.receipts.numbering === "per_year" ? yearName : null, digits].filter(Boolean).join("/");
    return { adminUsername, adminCreated, year: yearName, classes: classCount, feeHeads: headCount, receiptNext };
  });
}
