import { z } from "zod";

// ---------------------------------------------------------------- primitives
/** Accepts "1,234.50", "1234", 1234.5 (rupees) and yields integer paise. */
export const rupeesToPaise = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const str = typeof v === "number" ? v.toString() : v.replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid amount (max 2 decimals)" });
    return z.NEVER;
  }
  const [whole = "0", frac = ""] = str.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
});
export const positiveRupees = rupeesToPaise.refine((p) => p > 0, "Amount must be greater than zero");

export const mobile = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");
const blank = (v: unknown) => (v === "" || v == null ? undefined : v);
const optionalMobile = z.preprocess(blank, mobile.optional());
const optionalEmail = z.preprocess(blank, z.string().trim().email("Invalid email").optional());
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalDate = z.preprocess(blank, isoDate.optional());
const id = z.coerce.number().int().positive();
const optionalId = z.preprocess(blank, id.optional());
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be YYYY-MM");

// ---------------------------------------------------------------- accounts
export const roles = ["ADMIN", "ACCOUNTANT", "CASHIER", "PRINCIPAL"] as const;
export const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
export const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
export const changePasswordSchema = z
  .object({ current: z.string().min(1), next: passwordSchema, confirm: z.string() })
  .refine((d) => d.next === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
export const userSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9._-]+$/i, "Letters, digits, . _ - only"),
  fullName: z.string().trim().min(1),
  role: z.enum(roles),
  password: passwordSchema,
});

// ---------------------------------------------------------------- students
export const guardianSchema = z.object({
  name: z.string().trim().min(1, "Guardian name required"),
  relation: z.string().trim().default("Parent"),
  mobile,
  whatsappNo: optionalMobile,
  email: optionalEmail,
  preferredLanguage: z.string().default("en"),
  notifySms: checkbox,
  notifyWhatsapp: checkbox,
  notifyEmail: checkbox,
  messagingConsent: checkbox,
});
export const studentSchema = z.object({
  admissionNo: z.string().trim().min(1, "Admission no. required").max(32),
  name: z.string().trim().min(1, "Name required"),
  dob: optionalDate,
  gender: z.preprocess(blank, z.enum(["M", "F", "O"]).optional()),
  classId: id,
  sectionId: optionalId,
  rollNo: z.string().trim().optional(),
  admissionDate: isoDate,
  transportRouteId: optionalId,
});
/** Personal details + the class for one academic year (edit page). */
export const studentEditSchema = studentSchema.extend({ academicYearId: optionalId });
export const admissionSchema = studentSchema.extend({
  /** Academic year the student joins in. Defaults to the current year. */
  academicYearId: optionalId,
  guardian: guardianSchema.optional(),
  /** link to an existing guardian (siblings) instead of creating one */
  existingGuardianId: optionalId,
}).refine((d) => d.guardian || d.existingGuardianId, { message: "Guardian details required", path: ["guardian.name"] });
export type AdmissionInput = z.infer<typeof admissionSchema>;

/** Promote one student into another academic year. */
export const promoteStudentSchema = z.object({
  studentId: id,
  toYearId: id,
  classId: id,
  sectionId: optionalId,
  rollNo: z.preprocess(blank, z.string().trim().max(16).optional()),
  /** Move unpaid dues from earlier years into the new year as an opening-balance bill. */
  carryDues: checkbox,
});

const str = (v: unknown) => (v == null || v === "" ? undefined : String(v).trim());
export const importRowSchema = z.object({
  admissionNo: z.preprocess(str, z.string().min(1, "Admission no. required")),
  name: z.preprocess(str, z.string().min(1, "Name required")),
  className: z.preprocess(str, z.string().min(1, "Class required")),
  section: z.preprocess(str, z.string().optional()),
  rollNo: z.preprocess(str, z.string().optional()),
  dob: z.preprocess(str, isoDate.optional()),
  gender: z.preprocess(str, z.enum(["M", "F", "O"]).optional()),
  admissionDate: z.preprocess(str, isoDate),
  guardianName: z.preprocess(str, z.string().min(1, "Guardian name required")),
  guardianMobile: z.preprocess(str, mobile),
  guardianEmail: z.preprocess(str, z.string().email("Invalid email").optional()),
  guardianWhatsapp: z.preprocess(str, mobile.optional()),
  openingBalance: z.preprocess((v) => str(v) ?? "0", rupeesToPaise),
});
export type ImportRow = z.infer<typeof importRowSchema>;

// ---------------------------------------------------------------- fees
export const frequencies = ["monthly", "quarterly", "half_yearly", "annual", "one_time"] as const;
export const feeHeadSchema = z.object({
  code: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9_]+$/, "Use A-Z, 0-9, _")),
  name: z.string().trim().min(1),
  type: z.enum(["recurring", "one_time", "optional"]),
  isRefundable: checkbox,
});
export const structureItemSchema = z.object({
  structureId: id,
  feeHeadId: id,
  amount: rupeesToPaise,
  frequency: z.enum(frequencies),
  dueDay: z.coerce.number().int().min(1).max(28),
  applicableMonths: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.split(",").map((m) => Number(m.trim()))) : v ?? null),
    z.array(z.number().int().min(1).max(12)).nullable(),
  ),
});
/** Percent given as e.g. "10" / "12.5" → basis points; flat given as rupees → paise. */
export const concessionTypeSchema = z
  .object({
    name: z.string().trim().min(1),
    kind: z.enum(["percent", "flat"]),
    value: z.string().trim().min(1),
    feeHeadId: optionalId,
  })
  .transform((d, ctx) => {
    if (d.kind === "percent") {
      const pct = Number(d.value);
      if (!(pct > 0 && pct <= 100)) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Percent must be between 0 and 100" });
        return z.NEVER;
      }
      return { ...d, value: Math.round(pct * 100) };
    }
    const p = rupeesToPaise.safeParse(d.value);
    if (!p.success) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Invalid amount" });
      return z.NEVER;
    }
    return { ...d, value: p.data };
  });
export const studentConcessionSchema = z.object({
  studentId: id,
  concessionTypeId: id,
  validFrom: isoDate,
  validTo: optionalDate,
});
export const lateFeeRuleSchema = z
  .object({
    academicYearId: id,
    graceDays: z.coerce.number().int().min(0).max(90),
    kind: z.enum(["flat", "per_day", "percent"]),
    amount: z.string().trim().min(1),
    maxCap: rupeesToPaise,
    isActive: checkbox,
  })
  .transform((d, ctx) => {
    if (d.kind === "percent") {
      const pct = Number(d.amount);
      if (!(pct > 0 && pct <= 100)) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Percent must be between 0 and 100" });
        return z.NEVER;
      }
      return { ...d, amount: Math.round(pct * 100) };
    }
    const p = rupeesToPaise.safeParse(d.amount);
    if (!p.success) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Invalid amount" });
      return z.NEVER;
    }
    return { ...d, amount: p.data };
  });

// ---------------------------------------------------------------- billing
export const billRunSchema = z.object({
  period,
  classIds: z.array(id).default([]),
  studentId: optionalId,
  dryRun: z.boolean().default(true),
});
export type BillRunInput = z.input<typeof billRunSchema>;
export const miscChargeSchema = z.object({
  studentId: id,
  feeHeadId: id,
  description: z.string().trim().min(1),
  amount: positiveRupees,
  dueDate: isoDate,
});
export const cancelInvoiceSchema = z.object({ invoiceId: id, reason: z.string().trim().min(5, "Give a reason (min 5 characters)") });
export const creditNoteSchema = z.object({ invoiceId: id, amount: positiveRupees, reason: z.string().trim().min(5, "Give a reason (min 5 characters)") });

// ---------------------------------------------------------------- payments
export const paymentModes = ["cash", "upi", "cheque", "card", "bank_transfer", "dd"] as const;
export const collectPaymentSchema = z
  .object({
    studentId: id,
    amount: z.number().int().positive("Amount must be greater than zero"), // paise
    mode: z.enum(paymentModes),
    referenceNo: z.string().trim().optional(),
    bank: z.string().trim().optional(),
    chequeNo: z.string().trim().optional(),
    chequeDate: optionalDate,
    date: isoDate,
    /** Optional head-wise override: paise per invoice line. */
    allocations: z.array(z.object({ invoiceLineId: id, amount: z.number().int().positive() })).optional(),
  })
  .superRefine((d, ctx) => {
    if ((d.mode === "cheque" || d.mode === "dd") && (!d.chequeNo || !d.bank))
      ctx.addIssue({ code: "custom", path: ["chequeNo"], message: "Cheque/DD number and bank are required" });
    if (["upi", "card", "bank_transfer"].includes(d.mode) && !d.referenceNo)
      ctx.addIssue({ code: "custom", path: ["referenceNo"], message: "Reference / UTR number is required" });
    if (d.allocations) {
      const sum = d.allocations.reduce((a, x) => a + x.amount, 0);
      if (sum > d.amount) ctx.addIssue({ code: "custom", path: ["allocations"], message: "Allocations exceed the amount received" });
    }
  });
export type CollectPaymentInput = z.input<typeof collectPaymentSchema>;
export const cancelReceiptSchema = z.object({ paymentId: id, reason: z.string().trim().min(5, "Give a reason (min 5 characters)") });
export const chequeBounceSchema = z.object({ chequeId: id, bounceCharge: rupeesToPaise });
export const refundSchema = z.object({
  studentId: id,
  amount: positiveRupees,
  mode: z.enum(paymentModes),
  reason: z.string().trim().min(5),
});
export const denominations = ["2000", "500", "200", "100", "50", "20", "10", "5", "2", "1"] as const;
export const dayCloseSchema = z.object({
  date: isoDate,
  counts: z.record(z.string(), z.coerce.number().int().min(0)),
});

// ---------------------------------------------------------------- notifications & settings
export const templateSchema = z.object({
  id,
  subject: z.string().optional(),
  body: z.string().min(1),
  providerTemplateId: z.string().optional(),
  isActive: checkbox,
});
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.union([z.literal(""), z.string().trim().email()]),
  upiId: z.string().trim().optional(),
  invoicePrefix: z.string().trim().min(1).max(8),
  receiptPrefix: z.string().trim().min(1).max(8),
  quietStart: hhmm,
  quietEnd: hhmm,
  reminderDaysBefore: z.coerce.number().int().min(0).max(30),
  overdueSteps: z.string().transform((s) =>
    s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0),
  ),
  backupPath: z.string().trim().optional(),
});
export const providerConfigSchema = z.object({
  emailMode: z.enum(["off", "smtp", "console"]).default("console"),
  whatsappMode: z.enum(["off", "cloud", "console"]).default("console"),
  smsMode: z.enum(["off", "http", "gateway", "console"]).default("console"),
  smtpHost: z.string().default(""),
  smtpPort: z.coerce.number().int().default(587),
  smtpSecure: checkbox.default(false),
  smtpUser: z.string().default(""),
  smtpPass: z.string().default(""),
  smtpFrom: z.string().default(""),
  waPhoneNumberId: z.string().default(""),
  waAccessToken: z.string().default(""),
  waApiVersion: z.string().default("v21.0"),
  /** http: DLT provider URL with {to} {message} {template_id} {sender} placeholders */
  smsUrl: z.string().default(""),
  smsMethod: z.enum(["GET", "POST"]).default("GET"),
  smsSenderId: z.string().default(""),
  /** gateway: Android SMS-gateway app on the LAN (works with no internet) */
  smsGatewayUrl: z.string().default(""),
  smsGatewayToken: z.string().default(""),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** Turn a ZodError into { field: message } for forms. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_";
    out[k] ??= i.message;
  }
  return out;
}
export { z };
