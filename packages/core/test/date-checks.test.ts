/** Date rules shared by every form (packages/validation). No database needed. */
import { describe, expect, it } from "vitest";
import { admissionSchema, isoDate, dobDate, studentConcessionSchema } from "@sb/validation";

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe("date checks", () => {
  it("only real calendar dates between 2000 and 2099", () => {
    expect(ok(isoDate, "2026-04-01")).toBe(true);
    expect(ok(isoDate, "2028-02-29")).toBe(true); // leap year
    expect(ok(isoDate, "2027-02-29")).toBe(false);
    expect(ok(isoDate, "2026-02-31")).toBe(false);
    expect(ok(isoDate, "2026-13-01")).toBe(false);
    expect(ok(isoDate, "1926-04-01")).toBe(false);
    expect(ok(isoDate, "2126-04-01")).toBe(false);
    expect(ok(isoDate, "19-12-2030")).toBe(false); // wrong order
  });

  it("date of birth: in the past and not more than 30 years ago", () => {
    const now = new Date();
    expect(ok(dobDate, "2018-06-15")).toBe(true);
    expect(ok(dobDate, iso(new Date(now.getFullYear() + 4, 0, 1)))).toBe(false); // 2030-style typo
    expect(ok(dobDate, iso(now))).toBe(false); // born today
    expect(ok(dobDate, iso(new Date(now.getFullYear() - 31, 0, 1)))).toBe(false);
  });

  it("admission: date of birth must be before the admission date", () => {
    const base = { admissionNo: "X1", name: "A", classId: 1, admissionDate: "2026-04-01", guardian: { name: "P", mobile: "9876500001" } };
    expect(ok(admissionSchema, { ...base, dob: "2019-05-01" })).toBe(true);
    expect(ok(admissionSchema, { ...base, admissionDate: "2018-04-01", dob: "2019-05-01" })).toBe(false);
  });

  it("concession: 'valid to' cannot be before 'valid from'", () => {
    expect(ok(studentConcessionSchema, { studentId: 1, concessionTypeId: 1, validFrom: "2026-04-01", validTo: "2027-03-31" })).toBe(true);
    expect(ok(studentConcessionSchema, { studentId: 1, concessionTypeId: 1, validFrom: "2026-04-01", validTo: "2026-03-31" })).toBe(false);
    expect(ok(studentConcessionSchema, { studentId: 1, concessionTypeId: 1, validFrom: "2026-04-01" })).toBe(true);
  });
});
