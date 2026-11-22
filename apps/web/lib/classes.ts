const romanMap: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6,
  vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
};

/**
 * Computes a standardized numerical rank for school classes.
 * Covers:
 * - Pre-school: Playgroup (20), Pre-Nursery (30), Nursery (40), LKG (50), UKG (60)
 * - Grades 1 to 12:
 *   - Roman numerals: Class I .. Class XII, I .. XII, Std I .. Std XII (100, 200, ..., 1200)
 *   - Numbers: Class 1 .. Class 12, Grade 1 .. Grade 12, Std 1 .. Std 12, 1st .. 12th, 1 .. 12 (100, 200, ..., 1200)
 * - Custom classes: higher ranks (5000+) so standard grades always stay ordered properly.
 */
export function computeClassSortOrder(className: string): number {
  if (!className) return 5000;
  const raw = className.trim();
  const lower = raw.toLowerCase().replace(/[\s\-_.]+/g, " ");

  // 1. Pre-school / Early childhood
  if (/\b(creche|daycare|toddler)\b/.test(lower)) return 10;
  if (/\b(playgroup|play group|pg)\b/.test(lower)) return 20;
  if (/\b(pre nursery|pre-nursery|pre kg|pre-kg)\b/.test(lower)) return 30;
  if (/\b(nursery|nurs)\b/.test(lower)) return 40;
  if (/\b(lkg|lower kg|lower kindergarten|jr kg|junior kg|kg 1|kg1|kg i|pp1|pp 1)\b/.test(lower)) return 50;
  if (/\b(ukg|upper kg|upper kindergarten|sr kg|senior kg|kg 2|kg2|kg ii|pp2|pp 2|prep|kindergarten|kg)\b/.test(lower)) return 60;

  // 2. Roman Numerals (Class I .. Class XII, Std I .. XII, I .. XII)
  const romanMatch = lower.match(/(?:(?:class|grade|std|standard)\s+)?\b(xii|xi|viii|vii|vi|iv|ix|iii|ii|v|x|i)\b(?!\w)/);
  if (romanMatch && romanMatch[1] && romanMap[romanMatch[1]]) {
    return 100 * romanMap[romanMatch[1]]!;
  }

  // 3. Arabic numbers (Class 1 .. Class 12, Grade 1 .. Grade 12, 1st .. 12th, 1 .. 12)
  const numMatch = lower.match(/(?:(?:class|grade|std|standard)\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (numMatch && numMatch[1]) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1 && num <= 12) {
      return 100 * num;
    }
    if (num > 12) {
      return 1200 + num * 10;
    }
  }

  return 5000;
}

/**
 * Universal comparator that sorts classes in canonical educational order:
 * Nursery -> LKG -> UKG -> Class I -> Class II -> ... -> Class XII -> Custom classes.
 */
export function compareClasses<T extends { name: string; sortOrder?: number | null }>(
  a: T,
  b: T
): number {
  const orderA = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : computeClassSortOrder(a.name);
  const orderB = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : computeClassSortOrder(b.name);

  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/** Standard classes in teaching order */
export const STANDARD_CLASSES = [
  "Playgroup",
  "Nursery",
  "LKG",
  "UKG",
  "Class I",
  "Class II",
  "Class III",
  "Class IV",
  "Class V",
  "Class VI",
  "Class VII",
  "Class VIII",
  "Class IX",
  "Class X",
  "Class XI",
  "Class XII",
] as const;

export interface PresetClass {
  name: string;
  keywords: string[];
}

export const PRESET_CLASSES: PresetClass[] = [
  { name: "Playgroup", keywords: ["playgroup", "play group", "pg", "pre-kg", "pre kg", "toddler", "creche"] },
  { name: "Nursery", keywords: ["nursery", "nurs", "pre nursery", "pre-nursery", "early"] },
  { name: "LKG", keywords: ["lkg", "lower kg", "lower kindergarten", "jr kg", "junior kg", "kg 1", "kg1", "kg i", "pp1", "pp 1"] },
  { name: "UKG", keywords: ["ukg", "upper kg", "upper kindergarten", "sr kg", "senior kg", "kg 2", "kg2", "kg ii", "pp2", "pp 2", "prep"] },
  { name: "Class I", keywords: ["1", "1st", "first", "i", "std 1", "std i", "grade 1", "class 1"] },
  { name: "Class II", keywords: ["2", "2nd", "second", "ii", "std 2", "std ii", "grade 2", "class 2"] },
  { name: "Class III", keywords: ["3", "3rd", "third", "iii", "std 3", "std iii", "grade 3", "class 3"] },
  { name: "Class IV", keywords: ["4", "4th", "fourth", "iv", "std 4", "std iv", "grade 4", "class 4"] },
  { name: "Class V", keywords: ["5", "5th", "fifth", "v", "std 5", "std v", "grade 5", "class 5"] },
  { name: "Class VI", keywords: ["6", "6th", "sixth", "vi", "std 6", "std vi", "grade 6", "class 6"] },
  { name: "Class VII", keywords: ["7", "7th", "seventh", "vii", "std 7", "std vii", "grade 7", "class 7"] },
  { name: "Class VIII", keywords: ["8", "8th", "eighth", "viii", "std 8", "std viii", "grade 8", "class 8"] },
  { name: "Class IX", keywords: ["9", "9th", "ninth", "ix", "std 9", "std ix", "grade 9", "class 9"] },
  { name: "Class X", keywords: ["10", "10th", "tenth", "x", "std 10", "std x", "grade 10", "class 10", "matric"] },
  { name: "Class XI", keywords: ["11", "11th", "eleventh", "xi", "std 11", "std xi", "grade 11", "class 11", "first year", "plus one"] },
  { name: "Class XII", keywords: ["12", "12th", "twelfth", "xii", "std 12", "std xii", "grade 12", "class 12", "second year", "plus two"] },
];

/** Computes canonical sort order for any class name */
export function classOrder(name: string): number {
  return computeClassSortOrder(name);
}
