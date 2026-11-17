import { z } from "zod";

/**
 * A school's profile: everything that is specific to one school, in one file.
 * Used by `pnpm new-school --profile profiles/<school>.json` when a school is set up.
 * Money is written in rupees here (470 means ₹470); the system stores paise.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const feeCode = z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9_]+$/, "Use A-Z, 0-9 and _ only"));

export const feeHeadProfileSchema = z.object({
  code: feeCode,
  name: z.string().trim().min(1, "Fee head name is required"),
  type: z.enum(["recurring", "one_time", "optional"]),
  isRefundable: z.boolean().default(false),
  /** Row number of the fixed row on receipts and bills (1 = first). null = printed only when it has an amount. */
  receiptOrder: z.number().int().min(1).max(999).nullable().default(null),
  /** Wording on receipts and bills when it differs from the name. */
  receiptLabel: z.string().trim().max(60).nullable().default(null),
});

export const classProfileSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(32),
  sections: z.array(z.string().trim().min(1).max(16)).default([]),
});

export const schoolProfileSchema = z.object({
  profileName: z.string().trim().min(1).max(80),
  school: z.object({
    name: z.string().trim().min(1, "School name is required").max(120),
    headerSubtitle: z.string().trim().max(200).default(""),
    udiseCode: z.string().trim().max(40).default(""),
    registrationNote: z.string().trim().max(500).default(""),
    address: z.string().trim().max(200).default(""),
    phone: z.string().trim().max(20).default(""),
    email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).default(""),
    upiId: z.string().trim().max(80).default(""),
  }),
  academicYear: z.object({
    name: z.string().regex(/^\d{4}-\d{2}$/, "Use e.g. 2026-27"),
    startDate: isoDate,
    endDate: isoDate,
  }).refine((y) => y.startDate < y.endDate, { message: "End date must be after the start date", path: ["endDate"] }),
  classes: z.array(classProfileSchema).default([]),
  feeHeads: z.array(feeHeadProfileSchema).default([]),
  receipts: z.object({
    prefix: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9._-]+$/, "Letters, digits and . - _ only"),
    numbering: z.enum(["continuous", "per_year"]).default("per_year"),
    digits: z.number().int().min(1).max(10).default(6),
    /** First receipt number to issue. For a school with a paper receipt book: the number after its last receipt. */
    nextNumber: z.number().int().min(1).default(1),
  }),
  bills: z.object({ prefix: z.string().trim().min(1).max(8).default("INV") }).default({ prefix: "INV" }),
  /** null = no late fees. flat and per_day amounts are rupees; percent is a percentage of the fee. */
  lateFee: z.object({
    graceDays: z.number().int().min(0).max(90).default(0),
    kind: z.enum(["flat", "per_day", "percent"]),
    amount: z.number().min(0),
    /** Most a single bill can be charged, in rupees (0 = no cap). */
    maxCap: z.number().min(0).default(0),
  }).nullable().default(null),
  reminders: z.object({
    daysBefore: z.number().int().min(0).max(30).default(3),
    overdueSteps: z.array(z.number().int().min(1).max(365)).default([3, 7, 15]),
    quietStart: hhmm.default("09:00"),
    quietEnd: hhmm.default("20:00"),
  }).default({ daysBefore: 3, overdueSteps: [3, 7, 15], quietStart: "09:00", quietEnd: "20:00" }),
  features: z.object({
    concessions: z.boolean().default(false),
    counterClosing: z.boolean().default(false),
  }).default({ concessions: false, counterClosing: false }),
}).superRefine((p, ctx) => {
  const codes = new Set<string>();
  p.feeHeads.forEach((h, i) => {
    if (codes.has(h.code)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["feeHeads", i, "code"], message: `Fee head code ${h.code} is used twice` });
    codes.add(h.code);
  });
  const rows = new Map<number, string>();
  p.feeHeads.forEach((h, i) => {
    if (h.receiptOrder == null) return;
    const other = rows.get(h.receiptOrder);
    if (other) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["feeHeads", i, "receiptOrder"], message: `Receipt row ${h.receiptOrder} is used by both ${other} and ${h.code}` });
    rows.set(h.receiptOrder, h.code);
  });
});

export type SchoolProfile = z.infer<typeof schoolProfileSchema>;
export type FeeHeadProfile = z.infer<typeof feeHeadProfileSchema>;
