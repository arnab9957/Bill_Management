/** Integer paise. Never use floats for money. */
export type Paise = number & { readonly __brand: "Paise" };

export const paise = (n: number): Paise => {
  if (!Number.isSafeInteger(n)) throw new Error(`Amount must be whole paise, got ${n}`);
  return n as Paise;
};

export const sumPaise = (xs: readonly number[]): Paise => paise(xs.reduce((a, b) => a + b, 0));

/** Percentage of an amount where pct is in basis points (1000 = 10%). Rounds half-up. */
export const percentOf = (amount: number, basisPoints: number): Paise =>
  paise(Math.floor((amount * basisPoints + 5000) / 10000));

/** ₹ 1,23,456.50 (Indian grouping). Display only. */
export function formatINR(p: number, opts: { symbol?: boolean } = {}): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const rupees = Math.floor(abs / 100);
  const ps = abs % 100;
  const s = rupees.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  const body = `${grouped}.${ps.toString().padStart(2, "0")}`;
  return `${neg ? "-" : ""}${opts.symbol === false ? "" : "₹ "}${body}`;
}

/** Rupees as plain number string for forms: 123456 paise → "1234.56" */
export const toRupeeString = (p: number): string =>
  `${Math.floor(p / 100)}${p % 100 ? "." + (p % 100).toString().padStart(2, "0") : ""}`;

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ones[n]!;
  return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ones[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}
function rupeeWords(r: number): string {
  const parts: string[] = [];
  const crore = Math.floor(r / 10000000); r %= 10000000;
  const lakh = Math.floor(r / 100000); r %= 100000;
  const thousand = Math.floor(r / 1000); r %= 1000;
  if (crore) parts.push(`${crore >= 100 ? rupeeWords(crore) : below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (r) parts.push(below1000(r));
  return parts.join(" ");
}

/** Indian-system words: 123456 paise → "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only" */
export function amountInWords(p: number): string {
  if (p === 0) return "Rupees Zero Only";
  const r = Math.floor(Math.abs(p) / 100);
  const ps = Math.abs(p) % 100;
  const out = r ? `Rupees ${rupeeWords(r)}` : "";
  const psWords = ps ? `${below100(ps)} Paise` : "";
  return `${[out, psWords].filter(Boolean).join(" and ")} Only`;
}
