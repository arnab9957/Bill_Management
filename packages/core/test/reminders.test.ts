import { describe, expect, it } from "vitest";
import { reminderFor } from "../src/notifications";

// School defaults: remind 3 days before; overdue reminders at +3, +7, +15 days.
const at = (due: string, on: string) => reminderFor(due, on, 3, [3, 7, 15]);

describe("which reminder a bill gets on a given day", () => {
  it("nothing more than 3 days before the due date", () => {
    expect(at("2026-11-17", "2026-11-13")).toBeNull();
  });
  it("'due soon' on any of the 3 days before (catches up if the PC was off)", () => {
    for (const on of ["2026-11-14", "2026-11-15", "2026-11-16"]) {
      expect(at("2026-11-17", on)).toEqual({ event: "DUE_UPCOMING", step: 0, expires: "2026-11-16" });
    }
  });
  it("'due today' on the due date", () => {
    expect(at("2026-11-17", "2026-11-17")?.event).toBe("DUE_TODAY");
  });
  it("nothing in the first 2 days after the due date", () => {
    expect(at("2026-11-11", "2026-11-12")).toBeNull();
    expect(at("2026-11-11", "2026-11-13")).toBeNull();
  });
  it("overdue step 3 from day 3 to day 6, step 7 from day 7 to 14", () => {
    expect(at("2026-11-11", "2026-11-14")).toMatchObject({ event: "OVERDUE", step: 3 });
    expect(at("2026-11-11", "2026-11-16")).toMatchObject({ event: "OVERDUE", step: 3 }); // 5 days late, PC was off on day 3
    expect(at("2026-11-11", "2026-11-18")).toMatchObject({ event: "OVERDUE", step: 7 });
    expect(at("2026-11-11", "2026-11-25")).toMatchObject({ event: "OVERDUE", step: 7 });
  });
  it("last step (15) stays open 3 days, then stops — use 'Send reminder now' for older dues", () => {
    expect(at("2026-11-01", "2026-11-16")).toMatchObject({ event: "OVERDUE", step: 15, expires: "2026-11-18" });
    expect(at("2026-11-01", "2026-11-18")).toMatchObject({ step: 15 });
    expect(at("2026-11-01", "2026-11-19")).toBeNull();
  });
  it("no 'due soon' when the school sets 0 days before", () => {
    expect(reminderFor("2026-11-17", "2026-11-16", 0, [3])).toBeNull();
  });
});
