/**
 * Turns an audit-log entry into plain language: a one-line summary and a Before → After table.
 * Money is stored in paise, dates as YYYY-MM-DD; both are shown the way the school reads them.
 */
import { formatDate, formatINR, periodLabel } from "@sb/core";

type Obj = Record<string, unknown>;

/** Friendly names for record types (database table names). */
export const RECORD_NAMES: Record<string, string> = {
  payment: "Receipt", invoice: "Bill", student: "Student", guardian: "Parent", cheque: "Cheque", refund: "Refund",
  fee_structure_item: "Fee item", fee_structure: "Fee setup", student_concession: "Concession", concession_type: "Concession type",
  app_user: "User", school_settings: "School settings", day_close: "Day closing", notification_template: "Message template",
  academic_year: "Academic year", class: "Class", section: "Section", class_session: "Session dates",
  student_enrollment: "Class record", late_fee_rule: "Late fee rule", fee_head: "Fee head", school_logo: "School logo",
};
const ACTIONS: Record<string, string> = {
  create: "Created", update: "Changed", cancel: "Cancelled", delete: "Deleted", promote: "Promoted", undo_promote: "Promotion undone",
  status: "Status changed", grant: "Granted", revoke: "Revoked", late_fee: "Late fee added", credit_note: "Amount waived",
  bounce: "Cheque bounced", clear: "Cheque cleared", change_password: "Password changed", logout: "Signed out", close_day: "Day closed", copy: "Copied", import: "Imported", login: "Signed in",
};
export const actionName = (a: string) => ACTIONS[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Field labels; anything not listed is turned from camelCase into words. */
const LABELS: Record<string, string> = {
  invoiceNo: "Bill no.", receiptNo: "Receipt no.", net: "Amount", amount: "Amount", balance: "Balance due", lateFee: "Late fee",
  period: "For", auto: "Made by", mode: "Paid by", toWallet: "Kept as advance", allocations: "Applied to", carried: "Dues carried",
  opening: "Opening balance", misc: "Charge", reason: "Reason", status: "Status", step: "Late days", creditNote: "Credit note no.",
  classId: "Class", sectionId: "Section", rollNo: "Roll no.", academicYearId: "Academic year", toYear: "Into year", from: "From year", to: "To year",
  admissionNo: "Admission no.", name: "Name", dob: "Date of birth", admissionDate: "Admission date", leavingDate: "Leaving date",
  guardianId: "Parent", mobile: "Mobile", whatsappNo: "WhatsApp", email: "Email", messagingConsent: "Agreed to messages",
  startDate: "Start", endDate: "End", className: "Class", year: "Year", validFrom: "Valid from", validTo: "Valid to",
  bounceCharge: "Bounce charge", charge: "Bounce charge", fromYearId: "From year", toYearId: "To year", hikePercent: "Increase %", copied: "Items copied",
  moved: "Moved", skipped: "Skipped", promoted: "Promoted", repeated: "Repeating", left: "Left", passedOut: "Passed out", problems: "Problems",
  dueDate: "Due date", description: "Description", feeHeadId: "Fee head", isActive: "Active", role: "Role", username: "Username", fullName: "Full name",
};
const MONEY = new Set(["net", "amount", "balance", "lateFee", "toWallet", "carried", "opening", "bounceCharge", "charge", "gross", "discount", "paid", "credited", "monthlyFee", "maxCap", "systemCash", "countedCash", "systemTotal", "difference"]);
const HIDDEN = new Set(["id", "createdAt", "updatedAt", "passwordHash", "photoPath", "logoPath"]);

const words = (k: string) => LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);

function show(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (k === "auto") return v ? "Automatic (bill run)" : "A user";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && MONEY.has(k)) return formatINR(v);
  if (k === "period" && typeof v === "string") return periodLabel(v);
  if (isDate(v)) return formatDate(String(v).slice(0, 10));
  if (Array.isArray(v)) {
    if (k === "allocations") return `${v.length} bill line(s), ${formatINR(v.reduce((a, x) => a + Number((x as Obj).amount ?? 0), 0))}`;
    return v.length ? v.map((x) => (typeof x === "object" ? "…" : String(x))).join(", ") : "—";
  }
  if (typeof v === "object") return Object.entries(v as Obj).map(([a, b]) => `${words(a)}: ${show(a, b)}`).join(" · ");
  return String(v);
}

/** One readable line, e.g. "Bill INV/2027-28/000294 for Apr 2027 · ₹8,500 · automatic". */
export function auditSummary(table: string, action: string, oldV: unknown, newV: unknown): string {
  const n = (newV ?? {}) as Obj, o = (oldV ?? {}) as Obj;
  const what = RECORD_NAMES[table] ?? words(table);
  const parts: string[] = [];
  const no = n.invoiceNo ?? n.receiptNo ?? n.creditNote ?? n.admissionNo ?? n.name ?? n.className;
  parts.push(`${what}${no ? ` ${no}` : ""} ${actionName(action).toLowerCase()}`);
  if (n.period) parts.push(`for ${periodLabel(String(n.period))}`);
  if (table === "class") {
    // Whole-class promotion: the numbers are students, not money.
    const moved = Number(n.promoted ?? n.moved ?? 0) + Number(n.passedOut ?? 0);
    parts.push(`${moved} student(s)${n.to ? ` into ${n.to}` : n.year ? ` into ${n.year}` : ""}`);
    for (const [k, w] of [["repeated", "repeating"], ["left", "left"], ["skipped", "skipped"], ["carried", "with dues carried"]] as const) if (Number(n[k])) parts.push(`${n[k]} ${w}`);
    return parts.join(" · ");
  }
  for (const k of ["net", "amount", "lateFee", "opening", "carried", "charge"]) if (typeof n[k] === "number" && n[k]) { parts.push(formatINR(n[k] as number)); break; }
  if (n.mode) parts.push(`by ${String(n.mode).replace(/_/g, " ")}`);
  if (n.misc) parts.push(String(n.misc));
  if (n.reason) parts.push(`reason: ${n.reason}`);
  if (o.status !== undefined && n.status !== undefined && o.status !== n.status) parts.push(`${o.status} → ${n.status}`);
  if (n.toYear) parts.push(`into ${n.toYear}`);
  if (n.auto === true) parts.push("automatic");
  return parts.join(" · ");
}

/** Before → After table. Only changed fields when both sides exist. */
export function AuditChange({ oldV, newV }: { oldV: unknown; newV: unknown }) {
  const o = (oldV && typeof oldV === "object" && !Array.isArray(oldV) ? oldV : {}) as Obj;
  const n = (newV && typeof newV === "object" && !Array.isArray(newV) ? newV : {}) as Obj;
  const both = oldV != null && newV != null;
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDDEN.has(k))
    .filter((k) => !both || JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  if (!keys.length) return <p className="mt-1 text-xs text-gray-500">No field details recorded.</p>;
  return (
    <table className="mt-2 w-full text-xs">
      <thead><tr className="text-left text-gray-500">
        <th className="py-1 pr-3 font-medium">Field</th>
        {oldV != null && <th className="py-1 pr-3 font-medium">Before</th>}
        {newV != null && <th className="py-1 font-medium">{oldV != null ? "After" : "Value"}</th>}
      </tr></thead>
      <tbody>{keys.map((k) => (
        <tr key={k} className="border-t border-gray-100 align-top">
          <td className="py-1 pr-3 text-gray-600">{words(k)}</td>
          {oldV != null && <td className="py-1 pr-3 text-red-700">{show(k, o[k])}</td>}
          {newV != null && <td className="py-1 text-ink">{show(k, n[k])}</td>}
        </tr>
      ))}</tbody>
    </table>
  );
}
