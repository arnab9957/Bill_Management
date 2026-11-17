import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { schoolProfileSchema } from "@sb/validation";

const here = dirname(fileURLToPath(import.meta.url));
const profilesDir = resolve(here, "../../../profiles");

const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f)) : []);
const allProfiles = [...jsonFiles(profilesDir), ...jsonFiles(join(profilesDir, "examples")), ...jsonFiles(join(profilesDir, "local"))];

/** A small, valid profile to change one thing at a time in the tests below. */
const valid = () => JSON.parse(readFileSync(join(profilesDir, "school-default.json"), "utf8"));
const issues = (json: unknown) => {
  const r = schoolProfileSchema.safeParse(json);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("school profiles", () => {
  it("the template, the development demo and every example profile are valid", () => {
    expect(allProfiles.length).toBeGreaterThanOrEqual(3);
    for (const f of allProfiles) expect(issues(JSON.parse(readFileSync(f, "utf8"))), f).toEqual([]);
  });

  it("rejects a fee head code used twice", () => {
    const p = valid();
    p.feeHeads.push({ code: "tuition", name: "Again", type: "optional" });
    expect(issues(p).join(" | ")).toMatch(/Fee head code TUITION is used twice/);
  });

  it("rejects two fee heads on the same receipt row", () => {
    const p = valid();
    p.feeHeads.push({ code: "SPORTS", name: "Sports", type: "optional", receiptOrder: 1 });
    expect(issues(p).join(" | ")).toMatch(/Receipt row 1 is used by both/);
  });

  it("rejects an end date before the start date", () => {
    const p = valid();
    p.academicYear = { name: "2026-27", startDate: "2027-04-01", endDate: "2026-03-31" };
    expect(issues(p).join(" | ")).toMatch(/End date must be after the start date/);
  });

  it("rejects a receipt prefix with a slash, which would break the number format", () => {
    const p = valid();
    p.receipts.prefix = "A/B";
    expect(issues(p).join(" | ")).toMatch(/Letters, digits and \. - _ only/);
  });

  it("rejects a reminder time that is not HH:MM", () => {
    const p = valid();
    p.reminders.quietStart = "25:00";
    expect(issues(p).join(" | ")).toMatch(/Use HH:MM/);
  });

  it("accepts no late-fee rule (null) and fills in the defaults for missing sections", () => {
    const p = { profileName: "Minimal", school: { name: "Minimal school" }, academicYear: { name: "2026-27", startDate: "2026-04-01", endDate: "2027-03-31" }, receipts: { prefix: "R" } };
    expect(issues({ ...p, lateFee: null })).toEqual([]);
    const parsed = schoolProfileSchema.parse({ ...p, lateFee: null });
    expect(parsed.reminders.daysBefore).toBe(3);
    expect(parsed.reminders.overdueSteps).toEqual([3, 7, 15]);
    expect(parsed.receipts.numbering).toBe("per_year");
  });
});
