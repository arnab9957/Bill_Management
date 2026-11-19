/** Standard classes in teaching order; the position (1-based) is used as the class's sort order. */
export const STANDARD_CLASSES = [
  "Nursery", "LKG", "UKG",
  "Class I", "Class II", "Class III", "Class IV", "Class V", "Class VI",
  "Class VII", "Class VIII", "Class IX", "Class X", "Class XI", "Class XII",
] as const;

export function classOrder(name: string): number {
  const i = STANDARD_CLASSES.findIndex((c) => c.toLowerCase() === name.trim().toLowerCase());
  return i < 0 ? 0 : i + 1;
}
