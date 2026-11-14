import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { fees } from "@sb/core";

export const YEAR_COOKIE = "sb_year";

/**
 * The academic year the user is working in (sidebar switcher). Lists such as Students and
 * Bills show only this year's records. Defaults to the school's current year.
 */
export const getWorkingYear = cache(async () => {
  const { years } = await fees.masters();
  const current = years.find((y) => y.isCurrent) ?? years.at(-1);
  const picked = Number((await cookies()).get(YEAR_COOKIE)?.value);
  const year = years.find((y) => y.id === picked) ?? current;
  if (!year) throw new Error("No academic year configured");
  return { year, current: current!, years, isCurrent: year.id === current?.id };
});

/** The academic year that follows `yearId` (by start date), if one exists. */
export function nextYear<T extends { id: number; startDate: string }>(years: T[], yearId: number): T | undefined {
  const sorted = [...years].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const i = sorted.findIndex((y) => y.id === yearId);
  return i >= 0 ? sorted[i + 1] : undefined;
}
