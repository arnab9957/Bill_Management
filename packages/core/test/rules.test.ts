import { describe, expect, it } from "vitest";
import { amountInWords, formatINR, paise, percentOf } from "../src/money";
import { addDays, daysBetween, monthOffset } from "../src/dates";
import {
  allocateOldestFirst, concessionFor, deriveStatus, isDueInPeriod, lateFeeTarget, validateManualAllocation, type ScheduleItem,
} from "../src/billing/rules";

describe("money", () => {
  it("rejects fractional paise", () => {
    expect(() => paise(10.5)).toThrow();
    expect(paise(1050)).toBe(1050);
  });
  it("formats with Indian grouping", () => {
    expect(formatINR(12345678)).toBe("₹ 1,23,456.78");
    expect(formatINR(100)).toBe("₹ 1.00");
    expect(formatINR(1000000000, { symbol: false })).toBe("1,00,00,000.00");
  });
  it("percent in basis points rounds half up", () => {
    expect(percentOf(250000, 1000)).toBe(25000); // 10% of ₹2,500
    expect(percentOf(333, 5000)).toBe(167); // 50% of 3.33 = 1.665 → 1.67
  });
  it("amount in words", () => {
    expect(amountInWords(123456)).toBe("Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only");
    expect(amountInWords(25000000)).toBe("Rupees Two Lakh Fifty Thousand Only");
    expect(amountInWords(1234567800)).toBe("Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only");
    expect(amountInWords(50)).toBe("Fifty Paise Only");
    expect(amountInWords(0)).toBe("Rupees Zero Only");
  });
});

describe("dates", () => {
  it("offsets from academic year start", () => {
    expect(monthOffset("2026-04-01", "2026-04")).toBe(0);
    expect(monthOffset("2026-04-01", "2027-03")).toBe(11);
    expect(monthOffset("2026-04-01", "2026-03")).toBe(-1);
  });
  it("day math", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetween("2026-07-10", "2026-07-25")).toBe(15);
  });
});

describe("schedule", () => {
  const base = { feeHeadId: 1, amount: 1000, dueDay: 10, applicableMonths: null };
  const opts = { firstInvoiceOfYear: false, alreadyBilledThisYear: false };
  const due = (item: ScheduleItem, period: string, o = opts) => isDueInPeriod(item, period, "2026-04-01", o);

  it("monthly every month inside the year only", () => {
    const m = { ...base, frequency: "monthly" as const };
    expect(due(m, "2026-04")).toBe(true);
    expect(due(m, "2027-03")).toBe(true);
    expect(due(m, "2027-04")).toBe(false);
  });
  it("quarterly / half-yearly from year start", () => {
    const q = { ...base, frequency: "quarterly" as const };
    expect(["2026-04", "2026-05", "2026-07", "2026-10", "2027-01"].map((p) => due(q, p))).toEqual([true, false, true, true, true]);
    const h = { ...base, frequency: "half_yearly" as const };
    expect(["2026-04", "2026-07", "2026-10"].map((p) => due(h, p))).toEqual([true, false, true]);
  });
  it("annual and one-time: first month, or first invoice for mid-year admissions, never twice", () => {
    const a = { ...base, frequency: "annual" as const };
    expect(due(a, "2026-04")).toBe(true);
    expect(due(a, "2026-08")).toBe(false);
    expect(due(a, "2026-08", { firstInvoiceOfYear: true, alreadyBilledThisYear: false })).toBe(true);
    expect(due(a, "2026-04", { firstInvoiceOfYear: true, alreadyBilledThisYear: true })).toBe(false);
  });
  it("explicit applicable months override frequency", () => {
    const m = { ...base, frequency: "monthly" as const, applicableMonths: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2] }; // no March
    expect(due(m, "2027-03")).toBe(false);
    expect(due(m, "2027-02")).toBe(true);
  });
});

describe("concessions", () => {
  it("percent on matching head only, stacked, capped at line amount", () => {
    const rules = [
      { name: "Sibling", kind: "percent" as const, value: 1000, feeHeadId: 1 },
      { name: "Staff", kind: "flat" as const, value: 500000, feeHeadId: null },
    ];
    expect(concessionFor(2, 100000, rules.slice(0, 1)).discount).toBe(0);
    expect(concessionFor(1, 250000, rules.slice(0, 1))).toEqual({ discount: 25000, names: ["Sibling"] });
    expect(concessionFor(1, 250000, rules).discount).toBe(250000);
  });
});

describe("late fees", () => {
  const per = { graceDays: 5, kind: "per_day" as const, amount: 1000, maxCap: 5000 };
  it("nothing within grace", () => expect(lateFeeTarget(per, "2026-07-10", "2026-07-15", 0)).toBeNull());
  it("per day with step = days late, capped", () => {
    expect(lateFeeTarget(per, "2026-07-10", "2026-07-17", 0)).toEqual({ total: 2000, step: 2 });
    expect(lateFeeTarget(per, "2026-07-10", "2026-08-30", 0)).toEqual({ total: 5000, step: 46 });
  });
  it("flat and percent are single-step", () => {
    expect(lateFeeTarget({ graceDays: 0, kind: "flat", amount: 10000, maxCap: 0 }, "2026-07-10", "2026-07-20", 0)).toEqual({ total: 10000, step: 1 });
    expect(lateFeeTarget({ graceDays: 0, kind: "percent", amount: 200, maxCap: 0 }, "2026-07-10", "2026-07-11", 250000)).toEqual({ total: 5000, step: 1 });
  });
});

describe("allocation", () => {
  const lines = [
    { invoiceId: 2, invoiceLineId: 21, dueDate: "2026-08-10", balance: 300 },
    { invoiceId: 1, invoiceLineId: 11, dueDate: "2026-07-10", balance: 500 },
    { invoiceId: 1, invoiceLineId: 12, dueDate: "2026-07-10", balance: 200 },
  ];
  it("oldest first, partial", () => {
    const r = allocateOldestFirst(lines, 600);
    expect(r.allocations).toEqual([{ invoiceId: 1, invoiceLineId: 11, amount: 500 }, { invoiceId: 1, invoiceLineId: 12, amount: 100 }]);
    expect(r.remainder).toBe(0);
  });
  it("excess goes to remainder (wallet)", () => {
    expect(allocateOldestFirst(lines, 1500).remainder).toBe(500);
  });
  it("manual override validated", () => {
    expect(validateManualAllocation(lines, [{ invoiceLineId: 21, amount: 300 }], 400).remainder).toBe(100);
    expect(() => validateManualAllocation(lines, [{ invoiceLineId: 21, amount: 301 }], 400)).toThrow();
    expect(() => validateManualAllocation(lines, [{ invoiceLineId: 99, amount: 1 }], 400)).toThrow();
  });
});

describe("status", () => {
  it("derives", () => {
    const inv = { status: "issued" as const, net: 1000, paid: 0, balance: 1000, dueDate: "2026-07-10" };
    expect(deriveStatus(inv, "2026-07-01")).toBe("issued");
    expect(deriveStatus({ ...inv, paid: 400, balance: 600 }, "2026-07-01")).toBe("partial");
    expect(deriveStatus(inv, "2026-07-11")).toBe("overdue");
    expect(deriveStatus({ ...inv, paid: 1000, balance: 0 }, "2026-07-11")).toBe("paid");
  });
});
