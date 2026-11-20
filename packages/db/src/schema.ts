import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, serial, integer, bigint, text, varchar, boolean, date, timestamp, jsonb,
  uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

/** Money is ALWAYS integer paise. `mode: "number"` is safe up to ₹90 trillion. */
const paise = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- enums
export const roleEnum = pgEnum("role", ["ADMIN", "ACCOUNTANT", "CASHIER", "PRINCIPAL"]);
export const studentStatusEnum = pgEnum("student_status", ["active", "left", "alumni"]);
export const feeHeadTypeEnum = pgEnum("fee_head_type", ["recurring", "one_time", "optional"]);
export const frequencyEnum = pgEnum("frequency", ["monthly", "quarterly", "half_yearly", "annual", "one_time"]);
export const concessionKindEnum = pgEnum("concession_kind", ["percent", "flat"]);
export const lateFeeKindEnum = pgEnum("late_fee_kind", ["flat", "per_day", "percent"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["issued", "partial", "paid", "overdue", "cancelled"]);
export const lineKindEnum = pgEnum("line_kind", ["fee", "late_fee", "misc", "opening", "bounce_charge"]);
export const paymentModeEnum = pgEnum("payment_mode", ["cash", "upi", "cheque", "card", "bank_transfer", "dd"]);
export const paymentStatusEnum = pgEnum("payment_status", ["valid", "cancelled"]);
export const chequeStatusEnum = pgEnum("cheque_status", ["pending", "cleared", "bounced"]);
export const channelEnum = pgEnum("channel", ["sms", "whatsapp", "email"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["queued", "sending", "sent", "failed", "cancelled"]);
export const notifyEventEnum = pgEnum("notify_event", [
  "BILL_GENERATED", "DUE_UPCOMING", "DUE_TODAY", "OVERDUE", "PAYMENT_RECEIVED", "CHEQUE_BOUNCED", "LATE_FEE_APPLIED",
]);

// ---------------------------------------------------------------- settings & accounts
export const schoolSettings = pgTable("school_settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("My School"),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  logoPath: text("logo_path"),
  upiId: text("upi_id"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  receiptPrefix: text("receipt_prefix").notNull().default("RCT"),
  quietStart: varchar("quiet_start", { length: 5 }).notNull().default("09:00"), // sending window start
  quietEnd: varchar("quiet_end", { length: 5 }).notNull().default("20:00"),     // sending window end
  reminderDaysBefore: integer("reminder_days_before").notNull().default(3),
  overdueSteps: jsonb("overdue_steps").$type<number[]>().notNull().default([3, 7, 15]),
  backupPath: text("backup_path"),
  usbBackupLastAt: timestamp("usb_backup_last_at", { withTimezone: true }),
  /** AES-GCM encrypted JSON of provider credentials (SMTP, WhatsApp, SMS). */
  providerConfigEnc: text("provider_config_enc"),
  defaultLanguage: varchar("default_language", { length: 8 }).notNull().default("en"),
  /** Optional cash-counter closing (denomination count + day lock). Off for most schools. */
  dayCloseEnabled: boolean("day_close_enabled").notNull().default(false),
  /** Optional fee concessions (sibling, staff ward, merit…). Off unless the school uses them. */
  concessionsEnabled: boolean("concessions_enabled").notNull().default(false),
  // ---- printed header of bills and receipts (the school's own paper format)
  /** Line under the school name, e.g. "(Managed by … Parishad)". */
  headerSubtitle: text("header_subtitle").notNull().default(""),
  /** Printed as "U-Dise Code- <code>". */
  udiseCode: text("udise_code").notNull().default(""),
  /** Registration / recognition lines, one per line (society regn., 12A …). */
  registrationNote: text("registration_note").notNull().default(""),
  // ---- receipt numbering: [prefix]/[year]/[number]
  /** true: the academic year is part of the number and the series restarts every year. */
  receiptIncludeYear: boolean("receipt_include_year").notNull().default(true),
  /** Zero-padding of the number (1 = none, 6 = 000123). */
  receiptDigits: integer("receipt_digits").notNull().default(6),
  // ---- admission and roll numbering format
  admissionPrefix: text("admission_prefix").notNull().default(""),
  admissionIncludeYear: varchar("admission_include_year", { length: 16 }).notNull().default("none"),
  admissionSeparator: varchar("admission_separator", { length: 8 }).notNull().default("/"),
  admissionDigits: integer("admission_digits").notNull().default(4),
  admissionStartNumber: integer("admission_start_number").notNull().default(1),
  rollDigits: integer("roll_digits").notNull().default(1),
  rollPrefixSection: boolean("roll_prefix_section").notNull().default(false),
  rollStartNumber: integer("roll_start_number").notNull().default(1),
}, (t) => [check("single_row", sql`${t.id} = 1`)]);

export const users = pgTable("app_user", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable("session", {
  id: varchar("id", { length: 64 }).primaryKey(), // sha256 of the cookie token
  userId: integer("user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(),
  tableName: varchar("table_name", { length: 64 }).notNull(),
  recordId: text("record_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  ip: text("ip"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_table_record_idx").on(t.tableName, t.recordId), index("audit_at_idx").on(t.at)]);

/** Gap-free locked counters: INVOICE:2026-27, RECEIPT:2026-27, CREDIT_NOTE:2026-27 … */
export const numberSeries = pgTable("number_series", {
  key: varchar("key", { length: 64 }).primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
  /** First number of the series (1, or the number the school's paper book had reached). */
  startValue: integer("start_value").notNull().default(1),
});

// ---------------------------------------------------------------- masters
export const academicYears = pgTable("academic_year", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 16 }).notNull().unique(), // 2026-27
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
}, (t) => [uniqueIndex("one_current_year").on(t.isCurrent).where(sql`${t.isCurrent}`)]);

export const classes = pgTable("class", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 32 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sections = pgTable("section", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classes.id),
  name: varchar("name", { length: 16 }).notNull(),
}, (t) => [uniqueIndex("section_class_name").on(t.classId, t.name)]);

export const transportRoutes = pgTable("transport_route", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  stops: text("stops").notNull().default(""),
  monthlyFee: paise("monthly_fee"),
  isActive: boolean("is_active").notNull().default(true),
});

export const students = pgTable("student", {
  id: serial("id").primaryKey(),
  admissionNo: varchar("admission_no", { length: 32 }).notNull().unique(),
  name: text("name").notNull(),
  dob: date("dob"),
  gender: varchar("gender", { length: 8 }),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  rollNo: varchar("roll_no", { length: 16 }),
  status: studentStatusEnum("status").notNull().default("active"),
  admissionDate: date("admission_date").notNull(),
  leavingDate: date("leaving_date"),
  transportRouteId: integer("transport_route_id").references(() => transportRoutes.id),
  photoPath: text("photo_path"),
  createdAt: createdAt(),
}, (t) => [index("student_name_idx").on(t.name), index("student_class_idx").on(t.classId)]);

export const guardians = pgTable("guardian", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  relation: varchar("relation", { length: 32 }).notNull().default("Parent"),
  mobile: varchar("mobile", { length: 10 }).notNull(),
  whatsappNo: varchar("whatsapp_no", { length: 10 }),
  email: text("email"),
  preferredLanguage: varchar("preferred_language", { length: 8 }).notNull().default("en"),
  notifySms: boolean("notify_sms").notNull().default(true),
  notifyWhatsapp: boolean("notify_whatsapp").notNull().default(true),
  notifyEmail: boolean("notify_email").notNull().default(true),
  messagingConsent: boolean("messaging_consent").notNull().default(false),
}, (t) => [index("guardian_mobile_idx").on(t.mobile)]);

/**
 * One row per student per academic year: the class/section/roll for that year.
 * Promotion adds a row for the new year; earlier years stay as history.
 * student.classId/sectionId/rollNo mirror the student's latest enrolment.
 */
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["studying", "promoted", "left", "passed_out"]);
export const studentEnrollments = pgTable("student_enrollment", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id),
  classId: integer("class_id").notNull().references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  rollNo: varchar("roll_no", { length: 16 }),
  status: enrollmentStatusEnum("status").notNull().default("studying"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("enrollment_student_year").on(t.studentId, t.academicYearId),
  index("enrollment_year_class").on(t.academicYearId, t.classId),
]);

export const studentGuardians = pgTable("student_guardian", {
  studentId: integer("student_id").notNull().references(() => students.id),
  guardianId: integer("guardian_id").notNull().references(() => guardians.id),
  isPrimary: boolean("is_primary").notNull().default(true),
}, (t) => [uniqueIndex("student_guardian_pk").on(t.studentId, t.guardianId)]);

// ---------------------------------------------------------------- fee configuration
export const feeHeads = pgTable("fee_head", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // TUITION, TRANSPORT, LATE_FEE …
  name: text("name").notNull(),
  type: feeHeadTypeEnum("type").notNull().default("recurring"),
  isRefundable: boolean("is_refundable").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Position of this head's fixed row on printed receipts/bills. Null = printed only when it has an amount. */
  receiptOrder: integer("receipt_order"),
  /** Wording on receipts/bills when it differs from `name` (e.g. "Charges on fine"). */
  receiptLabel: text("receipt_label"),
});

export const feeStructures = pgTable("fee_structure", {
  id: serial("id").primaryKey(),
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id),
  classId: integer("class_id").notNull().references(() => classes.id),
}, (t) => [uniqueIndex("fee_structure_year_class").on(t.academicYearId, t.classId)]);

export const feeStructureItems = pgTable("fee_structure_item", {
  id: serial("id").primaryKey(),
  structureId: integer("structure_id").notNull().references(() => feeStructures.id),
  feeHeadId: integer("fee_head_id").notNull().references(() => feeHeads.id),
  amount: paise("amount"),
  frequency: frequencyEnum("frequency").notNull(),
  dueDay: integer("due_day").notNull().default(10),
  /** Calendar months 1-12 to bill in. Null = derive from frequency & year start. */
  applicableMonths: jsonb("applicable_months").$type<number[] | null>(),
}, (t) => [
  uniqueIndex("structure_item_head").on(t.structureId, t.feeHeadId),
  check("amount_nonneg", sql`${t.amount} >= 0`),
  check("due_day_range", sql`${t.dueDay} between 1 and 28`),
]);

export const concessionTypes = pgTable("concession_type", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: concessionKindEnum("kind").notNull(),
  /** percent: basis points (1000 = 10%); flat: paise per line */
  value: integer("value").notNull(),
  /** Null = applies to every head. */
  feeHeadId: integer("fee_head_id").references(() => feeHeads.id),
});

export const studentConcessions = pgTable("student_concession", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  concessionTypeId: integer("concession_type_id").notNull().references(() => concessionTypes.id),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
});

export const lateFeeRules = pgTable("late_fee_rule", {
  id: serial("id").primaryKey(),
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id).unique(),
  graceDays: integer("grace_days").notNull().default(0),
  kind: lateFeeKindEnum("kind").notNull(),
  /** flat/per_day: paise; percent: basis points of invoice fee amount */
  amount: integer("amount").notNull(),
  maxCap: paise("max_cap"),
  isActive: boolean("is_active").notNull().default(true),
});

// ---------------------------------------------------------------- transactions
export const invoices = pgTable("invoice", {
  id: serial("id").primaryKey(),
  invoiceNo: varchar("invoice_no", { length: 40 }).notNull().unique(),
  studentId: integer("student_id").notNull().references(() => students.id),
  academicYearId: integer("academic_year_id").notNull().references(() => academicYears.id),
  period: varchar("period", { length: 32 }).notNull(), // 2026-07, OPENING, MISC-…, CHQ-…
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  gross: paise("gross"),
  discount: paise("discount"),
  lateFee: paise("late_fee"),
  net: paise("net"),
  paid: paise("paid"),
  /** total credit-note reductions (already subtracted from net) */
  credited: paise("credited"),
  /** net − paid; 0 when cancelled */
  balance: paise("balance"),
  status: invoiceStatusEnum("status").notNull().default("issued"),
  cancelReason: text("cancel_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoice_student_period").on(t.studentId, t.academicYearId, t.period),
  index("invoice_due_idx").on(t.dueDate),
  check("invoice_balance_ok", sql`${t.status} = 'cancelled' or (${t.balance} = ${t.net} - ${t.paid} and ${t.balance} >= 0)`),
]);

export const invoiceLines = pgTable("invoice_line", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  feeHeadId: integer("fee_head_id").references(() => feeHeads.id),
  kind: lineKindEnum("kind").notNull().default("fee"),
  description: text("description").notNull(),
  amount: paise("amount"),
  discount: paise("discount"),
  /** reductions from credit notes */
  credited: paise("credited"),
  /** amount − discount − credited */
  net: paise("net"),
  paid: paise("paid"),
  lateFeeStep: integer("late_fee_step"),
}, (t) => [
  uniqueIndex("late_fee_step_once").on(t.invoiceId, t.lateFeeStep),
  check("line_paid_ok", sql`${t.paid} >= 0 and ${t.paid} <= ${t.net}`),
]);

export const payments = pgTable("payment", {
  id: serial("id").primaryKey(),
  receiptNo: varchar("receipt_no", { length: 40 }).notNull().unique(),
  /** Counter this receipt number came from (e.g. "RECEIPT:C") and its numeric part — independent of how the number is printed. */
  receiptSeries: varchar("receipt_series", { length: 64 }),
  receiptSeq: integer("receipt_seq"),
  studentId: integer("student_id").notNull().references(() => students.id),
  date: date("date").notNull(),
  amount: paise("amount"),
  /** amount not yet allocated to any invoice = wallet/advance */
  unallocated: paise("unallocated"),
  mode: paymentModeEnum("mode").notNull(),
  referenceNo: text("reference_no"),
  bank: text("bank"),
  receivedBy: integer("received_by").notNull().references(() => users.id),
  /** Academic year the payment belongs to (from its date). */
  academicYearId: integer("academic_year_id").references(() => academicYears.id),
  status: paymentStatusEnum("status").notNull().default("valid"),
  cancelReason: text("cancel_reason"),
  cancelledBy: integer("cancelled_by").references(() => users.id),
  printCount: integer("print_count").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  index("payment_student_idx").on(t.studentId),
  index("payment_date_idx").on(t.date),
  index("payment_year_idx").on(t.academicYearId),
  uniqueIndex("payment_series_seq").on(t.receiptSeries, t.receiptSeq),
  check("payment_amount_pos", sql`${t.amount} > 0`),
  check("payment_unalloc_ok", sql`${t.unallocated} >= 0 and ${t.unallocated} <= ${t.amount}`),
]);

export const paymentAllocations = pgTable("payment_allocation", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => payments.id),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  invoiceLineId: integer("invoice_line_id").notNull().references(() => invoiceLines.id),
  amount: paise("amount"),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("alloc_payment_idx").on(t.paymentId), index("alloc_invoice_idx").on(t.invoiceId)]);

export const cheques = pgTable("cheque", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => payments.id).unique(),
  chequeNo: varchar("cheque_no", { length: 32 }).notNull(),
  bank: text("bank").notNull(),
  chequeDate: date("cheque_date").notNull(),
  status: chequeStatusEnum("status").notNull().default("pending"),
  bounceCharge: paise("bounce_charge"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const creditNotes = pgTable("credit_note", {
  id: serial("id").primaryKey(),
  creditNoteNo: varchar("credit_note_no", { length: 40 }).notNull().unique(),
  studentId: integer("student_id").notNull().references(() => students.id),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
  amount: paise("amount"),
  reason: text("reason").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

/** Cached advance balance; source of truth = sum(payment.unallocated) − refunds. */
export const studentWallets = pgTable("student_wallet", {
  studentId: integer("student_id").primaryKey().references(() => students.id),
  balance: paise("balance"),
}, (t) => [check("wallet_nonneg", sql`${t.balance} >= 0`)]);

export const refunds = pgTable("refund", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id),
  amount: paise("amount"),
  mode: paymentModeEnum("mode").notNull(),
  reason: text("reason").notNull(),
  approvedBy: integer("approved_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const dayCloses = pgTable("day_close", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  systemTotal: paise("system_total"),
  systemCash: paise("system_cash"),
  countedCash: paise("counted_cash"),
  denominations: jsonb("denominations").$type<Record<string, number>>().notNull(),
  difference: bigint("difference", { mode: "number" }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("day_close_once").on(t.date, t.userId)]);

// ---------------------------------------------------------------- notifications
export const notificationTemplates = pgTable("notification_template", {
  id: serial("id").primaryKey(),
  event: notifyEventEnum("event").notNull(),
  channel: channelEnum("channel").notNull(),
  language: varchar("language", { length: 8 }).notNull().default("en"),
  subject: text("subject"),
  body: text("body").notNull(),
  providerTemplateId: text("provider_template_id"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("template_event_channel_lang").on(t.event, t.channel, t.language)]);

export const notificationOutbox = pgTable("notification_outbox", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  event: notifyEventEnum("event").notNull(),
  channel: channelEnum("channel").notNull(),
  recipient: text("recipient").notNull(),
  guardianId: integer("guardian_id").references(() => guardians.id),
  /** students and invoices this message is about (for history + paid re-check) */
  studentIds: jsonb("student_ids").$type<number[]>().notNull().default([]),
  invoiceIds: jsonb("invoice_ids").$type<number[]>().notNull().default([]),
  subject: text("subject"),
  body: text("body").notNull(),
  providerTemplateId: text("provider_template_id"),
  templateParams: jsonb("template_params").$type<Record<string, string>>(),
  attachmentPath: text("attachment_path"),
  status: outboxStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  providerMsgId: text("provider_msg_id"),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("outbox_pick_idx").on(t.status, t.nextAttemptAt)]);

// ---------------------------------------------------------------- operations
export const integrityIssues = pgTable("integrity_issue", {
  id: serial("id").primaryKey(),
  checkName: text("check_name").notNull(),
  detail: text("detail").notNull(),
  foundAt: timestamp("found_at", { withTimezone: true }).notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const backupLog = pgTable("backup_log", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 16 }).notNull(), // nightly | manual | pre_update | pre_promotion
  filePath: text("file_path").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  ok: boolean("ok").notNull(),
  error: text("error"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type StudentEnrollment = typeof studentEnrollments.$inferSelect;
export type Guardian = typeof guardians.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type FeeStructureItem = typeof feeStructureItems.$inferSelect;
export type ConcessionType = typeof concessionTypes.$inferSelect;
export type LateFeeRule = typeof lateFeeRules.$inferSelect;
export type OutboxRow = typeof notificationOutbox.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Channel = (typeof channelEnum.enumValues)[number];
export type NotifyEvent = (typeof notifyEventEnum.enumValues)[number];
export type PaymentMode = (typeof paymentModeEnum.enumValues)[number];
