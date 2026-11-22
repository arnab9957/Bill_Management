/**
 * Turns a payment (or a bill) into the rows of the school's printed grid:
 * a fixed list of fee heads in the school's own order, Rs./P. columns, zero for heads not paid.
 * Pure functions — no database — so the rules are unit tested.
 */

export interface PrintHead {
  id: number;
  name: string;
  type: "recurring" | "one_time" | "optional";
  /** Position of the fixed row; null = printed only when it has an amount. */
  receiptOrder: number | null;
  receiptLabel: string | null;
  sortOrder: number;
  isRefundable?: boolean;
}

/** One paid (or billed) amount against a fee head. */
export interface PrintLine {
  feeHeadId: number | null;
  /** paise */
  amount: number;
  /** Invoice period: "2026-09" for a monthly bill; anything else (OPENING, MISC-…) is not a month. */
  period: string | null;
}

export interface PrintRow {
  label: string;
  /** "Sept To Oct" — the months this row pays for. */
  period: string;
  /** paise */
  amount: number;
  /** false = not one of the school's fixed rows (shown only because it has an amount). */
  fixed: boolean;
  isRefundable?: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/**
 * Months covered, the way a clerk writes them: "Sept", "Sept To Oct", "Apr To Jun, Sept".
 * Anything that is not a YYYY-MM month is ignored.
 */
export function periodSpan(periods: readonly (string | null | undefined)[]): string {
  const idx = [...new Set(periods.flatMap((p) => {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p ?? "");
    return m ? [Number(m[1]) * 12 + Number(m[2]) - 1] : [];
  }))].sort((a, b) => a - b);
  if (idx.length === 0) return "";
  const name = (i: number) => MONTHS[i % 12]!;
  const runs: [number, number][] = [];
  for (const i of idx) {
    const last = runs.at(-1);
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => (a === b ? name(a) : `${name(a)} To ${name(b)}`)).join(", ");
}

/**
 * Build the grid rows. Fixed heads (receiptOrder set) always appear, in order, with 0 when unused.
 * Other heads with an amount follow as extra rows, so nothing is hidden and the total is always right.
 * `advance` (money kept as the student's advance balance) is shown as its own extra row.
 */
export function buildPrintRows(heads: readonly PrintHead[], lines: readonly PrintLine[], opts: { advance?: number } = {}): { rows: PrintRow[]; total: number } {
  const byHead = new Map<number | null, { amount: number; periods: string[] }>();
  for (const l of lines) {
    const cur = byHead.get(l.feeHeadId) ?? { amount: 0, periods: [] };
    cur.amount += l.amount;
    if (l.period) cur.periods.push(l.period);
    byHead.set(l.feeHeadId, cur);
  }
  const label = (h: PrintHead) => h.receiptLabel?.trim() || h.name;
  // Months are shown for recurring heads only: a one-time admission fee has no "month".
  const periodFor = (h: PrintHead | null, periods: string[]) => (h?.type === "recurring" ? periodSpan(periods) : "");

  const fixed = heads.filter((h) => h.receiptOrder != null)
    .sort((a, b) => a.receiptOrder! - b.receiptOrder! || a.sortOrder - b.sortOrder || a.id - b.id);
  const rows: PrintRow[] = fixed.map((h) => {
    const v = byHead.get(h.id);
    return {
      label: label(h),
      period: periodFor(h, v?.periods ?? []),
      amount: v?.amount ?? 0,
      fixed: true,
      ...(h.isRefundable ? { isRefundable: true } : {}),
    };
  });

  const fixedIds = new Set(fixed.map((h) => h.id));
  for (const h of heads) {
    const v = byHead.get(h.id);
    if (!fixedIds.has(h.id) && v && v.amount !== 0) {
      rows.push({
        label: label(h),
        period: periodFor(h, v.periods),
        amount: v.amount,
        fixed: false,
        ...(h.isRefundable ? { isRefundable: true } : {}),
      });
    }
  }
  const unknown = byHead.get(null);
  if (unknown && unknown.amount !== 0) rows.push({ label: "Other", period: "", amount: unknown.amount, fixed: false });
  // Heads deleted or missing from the list passed in still count towards the total.
  const known = new Set<number | null>([...heads.map((h) => h.id), null]);
  for (const [id, v] of byHead) if (!known.has(id) && v.amount !== 0) rows.push({ label: "Other", period: "", amount: v.amount, fixed: false });

  if (opts.advance && opts.advance > 0) rows.push({ label: "Advance", period: "", amount: opts.advance, fixed: false });
  return { rows, total: rows.reduce((a, r) => a + r.amount, 0) };
}

/** Rupees and paise columns of the grid: 94050 → { rs: "940", p: "50" }; zero paise print as "0". */
export function rupeesAndPaise(amount: number): { rs: string; p: string } {
  const neg = amount < 0;
  const a = Math.abs(amount);
  const p = a % 100;
  return { rs: `${neg ? "-" : ""}${Math.floor(a / 100)}`, p: p === 0 ? "0" : String(p).padStart(2, "0") };
}
