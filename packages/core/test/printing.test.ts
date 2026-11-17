import { describe, expect, it } from "vitest";
import { buildPrintRows, periodSpan, rupeesAndPaise, type PrintHead } from "../src/printing";
import { formatDMY } from "../src/dates";
import { formatReceiptNo, receiptSeriesKey } from "../src/common";

const head = (id: number, name: string, order: number | null, extra: Partial<PrintHead> = {}): PrintHead =>
  ({ id, name, type: "recurring", receiptOrder: order, receiptLabel: null, sortOrder: id, ...extra });

// The school's own list, in its own order (abridged).
const heads: PrintHead[] = [
  head(1, "Tuition Fee", 1, { receiptLabel: "Tuition Fees" }),
  head(2, "Computer Fee", 2, { receiptLabel: "Computer fees" }),
  head(3, "Late Fee", 3, { receiptLabel: "Charges on fine", type: "optional" }),
  head(4, "Admission Fee", 4, { type: "one_time" }),
  head(5, "Miscellaneous", 5, { type: "optional" }),
  head(6, "Transport Fee", null),
  head(7, "Opening Balance", null, { type: "optional" }),
];

describe("months covered", () => {
  it("writes them like a clerk", () => {
    expect(periodSpan(["2026-09"])).toBe("Sept");
    expect(periodSpan(["2026-09", "2026-10"])).toBe("Sept To Oct");
    expect(periodSpan(["2026-10", "2026-09", "2026-09"])).toBe("Sept To Oct");
    expect(periodSpan(["2026-04", "2026-05", "2026-06", "2026-09"])).toBe("Apr To Jun, Sept");
    expect(periodSpan(["2026-12", "2027-01"])).toBe("Dec To Jan");
  });
  it("ignores bills that are not for a month", () => {
    expect(periodSpan(["OPENING", "MISC-INV/2026-27/000001", null, undefined])).toBe("");
    expect(periodSpan([])).toBe("");
  });
});

describe("rows of the school's grid", () => {
  it("always prints every fixed head in the school's order, with 0 for unused ones", () => {
    const { rows, total } = buildPrintRows(heads, [
      { feeHeadId: 2, amount: 8000, period: "2026-09" }, { feeHeadId: 1, amount: 47000, period: "2026-09" },
      { feeHeadId: 1, amount: 47000, period: "2026-10" }, { feeHeadId: 2, amount: 8000, period: "2026-10" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Tuition Fees", "Computer fees", "Charges on fine", "Admission Fee", "Miscellaneous"]);
    expect(rows.map((r) => r.amount)).toEqual([94000, 16000, 0, 0, 0]);
    expect(rows[0]!.period).toBe("Sept To Oct");
    expect(total).toBe(110000);
  });

  it("uses the printed label when set, otherwise the head's name", () => {
    const { rows } = buildPrintRows(heads, []);
    expect(rows[0]!.label).toBe("Tuition Fees");
    expect(rows[3]!.label).toBe("Admission Fee");
  });

  it("shows months only for recurring heads", () => {
    const { rows } = buildPrintRows(heads, [{ feeHeadId: 4, amount: 100000, period: "2026-04" }, { feeHeadId: 3, amount: 5000, period: "2026-04" }]);
    expect(rows.find((r) => r.label === "Admission Fee")!.period).toBe("");
    expect(rows.find((r) => r.label === "Charges on fine")!.period).toBe("");
  });

  it("adds a row for a head that is not one of the fixed rows, so nothing is hidden", () => {
    const { rows, total } = buildPrintRows(heads, [{ feeHeadId: 6, amount: 80000, period: "2026-09" }, { feeHeadId: 1, amount: 47000, period: "2026-09" }]);
    const extra = rows.filter((r) => !r.fixed);
    expect(extra).toEqual([{ label: "Transport Fee", period: "Sept", amount: 80000, fixed: false }]);
    expect(rows.at(-1)!.label).toBe("Transport Fee");
    expect(total).toBe(127000);
  });

  it("keeps amounts with no head and money kept as advance, so the total equals what was paid", () => {
    const { rows, total } = buildPrintRows(heads, [{ feeHeadId: null, amount: 3000, period: null }, { feeHeadId: 1, amount: 47000, period: "2026-09" }], { advance: 20000 });
    expect(rows.slice(-2).map((r) => [r.label, r.amount])).toEqual([["Other", 3000], ["Advance", 20000]]);
    expect(total).toBe(70000);
  });

  it("orders ties by the head's own sort order", () => {
    const { rows } = buildPrintRows([head(2, "B", 1, { sortOrder: 20 }), head(1, "A", 1, { sortOrder: 10 })], []);
    expect(rows.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("never loses money for a head that is missing from the list", () => {
    const { total, rows } = buildPrintRows(heads, [{ feeHeadId: 999, amount: 1234, period: null }]);
    expect(total).toBe(1234);
    expect(rows.at(-1)!.label).toBe("Other");
  });
});

describe("Rs. and P. columns", () => {
  it("splits rupees and paise; zero paise print as 0", () => {
    expect(rupeesAndPaise(110000)).toEqual({ rs: "1100", p: "0" });
    expect(rupeesAndPaise(94050)).toEqual({ rs: "940", p: "50" });
    expect(rupeesAndPaise(1005)).toEqual({ rs: "10", p: "05" });
    expect(rupeesAndPaise(0)).toEqual({ rs: "0", p: "0" });
  });
});

describe("dates and receipt numbers", () => {
  it("prints dates as day-month-year", () => {
    expect(formatDMY("2026-11-13")).toBe("13-11-2026");
    expect(formatDMY(null)).toBe("");
  });
  it("numbers like the school's book (C/6434) or with the year (RCT/2026-27/000123)", () => {
    expect(formatReceiptNo({ receiptPrefix: "C", receiptIncludeYear: false, receiptDigits: 1 }, "2026-27", 6434)).toBe("C/6434");
    expect(formatReceiptNo({ receiptPrefix: "RCT", receiptIncludeYear: true, receiptDigits: 6 }, "2026-27", 123)).toBe("RCT/2026-27/000123");
    expect(formatReceiptNo({ receiptPrefix: "C", receiptIncludeYear: false, receiptDigits: 4 }, "2026-27", 7)).toBe("C/0007");
  });
  it("draws numbers from one counter per prefix, or per prefix and year", () => {
    expect(receiptSeriesKey({ receiptPrefix: "C", receiptIncludeYear: false }, "2026-27")).toBe("RECEIPT:C");
    expect(receiptSeriesKey({ receiptPrefix: "C", receiptIncludeYear: true }, "2026-27")).toBe("RECEIPT:C:2026-27");
  });
});
