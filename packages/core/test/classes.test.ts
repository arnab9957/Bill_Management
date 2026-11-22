import { describe, expect, it } from "vitest";
import { compareClasses, computeClassSortOrder } from "../src/classes";

describe("Class Ordering", () => {
  it("correctly ranks standard pre-school and school classes", () => {
    expect(computeClassSortOrder("Playgroup")).toBe(20);
    expect(computeClassSortOrder("Nursery")).toBe(40);
    expect(computeClassSortOrder("LKG")).toBe(50);
    expect(computeClassSortOrder("UKG")).toBe(60);

    expect(computeClassSortOrder("Class I")).toBe(100);
    expect(computeClassSortOrder("Class 1")).toBe(100);
    expect(computeClassSortOrder("1st")).toBe(100);

    expect(computeClassSortOrder("Class II")).toBe(200);
    expect(computeClassSortOrder("Class 2")).toBe(200);

    expect(computeClassSortOrder("Class IX")).toBe(900);
    expect(computeClassSortOrder("Class 9")).toBe(900);

    expect(computeClassSortOrder("Class X")).toBe(1000);
    expect(computeClassSortOrder("Class 10")).toBe(1000);

    expect(computeClassSortOrder("Class XI")).toBe(1100);
    expect(computeClassSortOrder("Class 11")).toBe(1100);

    expect(computeClassSortOrder("Class XII")).toBe(1200);
    expect(computeClassSortOrder("Class 12")).toBe(1200);
  });

  it("sorts classes in natural educational sequence", () => {
    const unsorted = [
      { name: "Class X" },
      { name: "Class I" },
      { name: "LKG" },
      { name: "Nursery" },
      { name: "Class II" },
      { name: "UKG" },
      { name: "Class IX" },
      { name: "Playgroup" },
      { name: "Class XII" },
      { name: "Class XI" },
    ];

    const sorted = [...unsorted].sort(compareClasses).map((c) => c.name);

    expect(sorted).toEqual([
      "Playgroup",
      "Nursery",
      "LKG",
      "UKG",
      "Class I",
      "Class II",
      "Class IX",
      "Class X",
      "Class XI",
      "Class XII",
    ]);
  });

  it("correctly ranks Arabic number classes like Class 1 .. Class 10", () => {
    const unsorted = [
      { name: "Class 10" },
      { name: "Class 2" },
      { name: "Class 1" },
      { name: "Nursery" },
    ];

    const sorted = [...unsorted].sort(compareClasses).map((c) => c.name);

    expect(sorted).toEqual([
      "Nursery",
      "Class 1",
      "Class 2",
      "Class 10",
    ]);
  });

  it("handles classes with sortOrder = 0 by falling back to canonical rank", () => {
    const list = [
      { name: "Class I", sortOrder: 0 },
      { name: "Nursery", sortOrder: 1 },
      { name: "LKG", sortOrder: 2 },
    ];

    const sorted = [...list].sort(compareClasses).map((c) => c.name);
    expect(sorted).toEqual(["Nursery", "LKG", "Class I"]);
  });
});
