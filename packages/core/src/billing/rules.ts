/**
 * Pure billing rules — no database. Everything here is unit tested.
 */
import { monthOffset, parsePeriod, daysBetween, type ISODate } from "../dates";
import { percentOf, paise, type Paise } from "../money";

export type Frequency = "monthly" | "quarterly" | "half_yearly" | "annual" | "one_time";

export interface ScheduleItem {
  feeHeadId: number;
  amount: number;
  frequency: Frequency;
  dueDay: number;
  applicableMonths: number[] | null;
}

/**
 * Is a structure item billable in `period`?
 * @param yearStart academic year start date (e.g. 2026-04-01)
 * @param firstInvoiceOfYear true when the student has no invoice yet this year
 *        (mid-year admission): annual / one-time heads are then billed now.
 * @param alreadyBilledThisYear head already appears on an earlier invoice this year
 */
export function isDueInPeriod(
  item: ScheduleItem,
  period: string,
  yearStart: ISODate,
  opts: { firstInvoiceOfYear: boolean; alreadyBilledThisYear: boolean },
): boolean {
  const offset = monthOffset(yearStart, period);
  if (offset < 0 || offset > 11) return false;
  const month = parsePeriod(period).month;

  if (item.frequency === "one_time" || item.frequency === "annual") {
    if (opts.alreadyBilledThisYear) return false;
    if (item.applicableMonths?.length) return item.applicableMonths.includes(month) || opts.firstInvoiceOfYear;
    return offset === 0 || opts.firstInvoiceOfYear;
  }
  if (item.applicableMonths?.length) return item.applicableMonths.includes(month);
  switch (item.frequency) {
    case "monthly": return true;
    case "quarterly": return offset % 3 === 0;
    case "half_yearly": return offset % 6 === 0;
  }
}

export interface ConcessionRule {
  name: string;
  kind: "percent" | "flat";
  /** percent: basis points; flat: paise */
  value: number;
  /** null = all heads */
  feeHeadId: number | null;
}

/** Total discount for one line from all applicable concessions, never more than the line. */
export function concessionFor(feeHeadId: number, amount: number, rules: readonly ConcessionRule[]): { discount: Paise; names: string[] } {
  let discount = 0;
  const names: string[] = [];
  for (const r of rules) {
    if (r.feeHeadId !== null && r.feeHeadId !== feeHeadId) continue;
    const d = r.kind === "percent" ? percentOf(amount, r.value) : r.value;
    if (d > 0) {
      discount += d;
      names.push(r.name);
    }
  }
  return { discount: paise(Math.min(discount, amount)), names };
}

export interface LateFeeRuleInput {
  graceDays: number;
  kind: "flat" | "per_day" | "percent";
  /** flat/per_day: paise; percent: basis points */
  amount: number;
  /** paise; 0 = no cap */
  maxCap: number;
}

/**
 * Total late fee an invoice should carry today, and the step key that makes
 * applying it idempotent (one line per step).
 * Returns null when nothing is due yet.
 */
export function lateFeeTarget(
  rule: LateFeeRuleInput,
  dueDate: ISODate,
  onDate: ISODate,
  feeAmount: number,
): { total: Paise; step: number } | null {
  if (rule.amount <= 0) return null;
  const daysLate = daysBetween(dueDate, onDate) - rule.graceDays;
  if (daysLate <= 0) return null;
  let total: number;
  let step: number;
  switch (rule.kind) {
    case "flat": total = rule.amount; step = 1; break;
    case "percent": total = percentOf(feeAmount, rule.amount); step = 1; break;
    case "per_day": total = rule.amount * daysLate; step = daysLate; break;
  }
  if (rule.maxCap > 0) total = Math.min(total, rule.maxCap);
  return total > 0 ? { total: paise(total), step } : null;
}

export interface OpenLine {
  invoiceId: number;
  invoiceLineId: number;
  dueDate: ISODate;
  /** remaining payable on the line */
  balance: number;
}

/** Oldest dues first; within an invoice, in line order. Excess is returned as `remainder`. */
export function allocateOldestFirst(lines: readonly OpenLine[], amount: number): { allocations: { invoiceId: number; invoiceLineId: number; amount: Paise }[]; remainder: Paise } {
  const sorted = [...lines].sort((a, b) => (a.dueDate === b.dueDate ? a.invoiceId - b.invoiceId || a.invoiceLineId - b.invoiceLineId : a.dueDate < b.dueDate ? -1 : 1));
  let left = amount;
  const allocations: { invoiceId: number; invoiceLineId: number; amount: Paise }[] = [];
  for (const l of sorted) {
    if (left <= 0) break;
    if (l.balance <= 0) continue;
    const take = Math.min(left, l.balance);
    allocations.push({ invoiceId: l.invoiceId, invoiceLineId: l.invoiceLineId, amount: paise(take) });
    left -= take;
  }
  return { allocations, remainder: paise(left) };
}

/** Validate a cashier's head-wise override against open lines. */
export function validateManualAllocation(
  lines: readonly OpenLine[],
  manual: readonly { invoiceLineId: number; amount: number }[],
  amount: number,
): { allocations: { invoiceId: number; invoiceLineId: number; amount: Paise }[]; remainder: Paise } {
  const byId = new Map(lines.map((l) => [l.invoiceLineId, l]));
  const allocations = manual.filter((m) => m.amount > 0).map((m) => {
    const l = byId.get(m.invoiceLineId);
    if (!l) throw new Error(`Line ${m.invoiceLineId} is not an open due of this student`);
    if (m.amount > l.balance) throw new Error(`Allocation exceeds the balance of line ${m.invoiceLineId}`);
    return { invoiceId: l.invoiceId, invoiceLineId: l.invoiceLineId, amount: paise(m.amount) };
  });
  const total = allocations.reduce((a, x) => a + x.amount, 0);
  if (total > amount) throw new Error("Allocations exceed the amount received");
  return { allocations, remainder: paise(amount - total) };
}

export type InvoiceStatus = "issued" | "partial" | "paid" | "overdue" | "cancelled";
export function deriveStatus(inv: { status: InvoiceStatus; net: number; paid: number; balance: number; dueDate: ISODate }, onDate: ISODate): InvoiceStatus {
  if (inv.status === "cancelled") return "cancelled";
  if (inv.balance <= 0) return "paid";
  if (inv.dueDate < onDate) return "overdue";
  return inv.paid > 0 ? "partial" : "issued";
}
