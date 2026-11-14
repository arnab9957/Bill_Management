/** Dates are handled as local YYYY-MM-DD strings (Postgres `date`), never as UTC instants. */
export type ISODate = string;

const pad = (n: number) => n.toString().padStart(2, "0");

export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = (): ISODate => toISODate(new Date());

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}
export const addDays = (s: ISODate, n: number): ISODate => {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
/** Whole days from a to b (b − a). */
export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);

/** "2026-07" → { year: 2026, month: 7 } */
export function parsePeriod(period: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Bad period ${period}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}
export const periodOf = (date: ISODate): string => date.slice(0, 7);
export const dateInPeriod = (period: string, day: number): ISODate => {
  const { year, month } = parsePeriod(period);
  return `${year}-${pad(month)}-${pad(day)}`;
};
export function periodLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  const { year, month } = parsePeriod(period);
  return new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}
/** Month index (0-based) of `period` counted from the academic year's start month. */
export function monthOffset(yearStart: ISODate, period: string): number {
  const s = parsePeriod(periodOf(yearStart));
  const p = parsePeriod(period);
  return (p.year - s.year) * 12 + (p.month - s.month);
}
export const formatDate = (s: ISODate | null | undefined): string => {
  if (!s) return "";
  const d = parseISODate(s);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
