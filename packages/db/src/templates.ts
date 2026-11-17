import * as s from "./schema";

type T = typeof s.notificationTemplates.$inferInsert;

/** Default message texts (English) for every event and channel. Each school edits them under Messages → Templates. */
export function defaultTemplates(): T[] {
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
  return tpl;
}
