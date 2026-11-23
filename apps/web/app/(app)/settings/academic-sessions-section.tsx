"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { buttonClass, cx } from "@/components/ui";
function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
import type { ActionState } from "@/lib/action";
import { CollapsibleSection, useSectionCollapse } from "./section-collapse";

export type AcademicYearItem = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};

export type ClassSessionRow = {
  classId: number;
  className: string;
  startDate: string;
  endDate: string;
  custom: boolean;
};

const field = "field-stack";

export function AcademicSessionsSection({
  years,
  makeCurrent,
  addYear,
  saveSession,
  sessYear,
  sessRows,
}: {
  years: AcademicYearItem[];
  makeCurrent: (id: number) => Promise<void>;
  addYear: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  saveSession: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  sessYear?: AcademicYearItem | null;
  sessRows: ClassSessionRow[];
}) {
  const { open } = useSectionCollapse("academic-sessions");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditing(false);
    }
  }, [open]);

  return (
    <CollapsibleSection
      id="academic-sessions"
      title="Academic sessions"
      subtitle="Create sessions, set active year, and configure per-class term dates."
      actions={
        open ? (
          !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink shadow-2xs hover:bg-accent hover:text-white transition-all cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L4.5 13.5l-3 1 1-3 9-9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer"
            >
              Done
            </button>
          )
        ) : undefined
      }
    >
      <div className="rounded-lg border border-gray-200/80 bg-white overflow-hidden divide-y divide-gray-100">
        {years.map((y) => (
          <div key={y.id} className="flex flex-wrap justify-between items-center px-4 py-3 gap-2">
            <div>
              <b className="text-ink">{y.name}</b>
              <span className="text-gray-500 text-xs ml-2">({y.startDate} → {y.endDate})</span>
            </div>
            {y.isCurrent ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Current session
              </span>
            ) : editing ? (
              <form action={makeCurrent.bind(null, y.id)}>
                <button className="text-xs font-semibold text-accent-ink hover:text-accent cursor-pointer hover:underline">Make current</button>
              </form>
            ) : null}
          </div>
        ))}
      </div>

      <div className={cx("mt-4 border-t border-gray-100 pt-3 transition-opacity", !editing && "opacity-75")}>
        <fieldset disabled={!editing}>
          <ActionForm action={addYear} resetOnSuccess>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.1fr_1.2fr_1.2fr_auto] sm:items-end">
              <label className={field}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">New session name</span>
                <input name="name" placeholder="2027-28" required className="w-full min-w-0" />
              </label>
              <label className={field}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Start date</span>
                <input type="date" name="startDate" aria-label="Year start" required className="w-full min-w-0" />
              </label>
              <label className={field}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">End date</span>
                <input type="date" name="endDate" data-after="startDate" data-months="12" required className="w-full min-w-0" />
              </label>
              <div className="pt-1 sm:pt-0">
                <Submit variant="secondary" className="w-full sm:w-auto">Add session</Submit>
              </div>
            </div>
            <FieldError name="name" />
            <FieldError name="endDate" />
          </ActionForm>
        </fieldset>
      </div>

      {sessYear && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-ink">Class session dates</h3>
            <div className="flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Academic year">
              {years.map((y) => (
                <Link
                  key={y.id}
                  href={`/settings?sy=${y.id}#academic-sessions`}
                  scroll={false}
                  className={cx(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150",
                    y.id === sessYear.id
                      ? "bg-accent text-white shadow-xs"
                      : "border border-gray-200 bg-surface text-gray-700 hover:border-accent/40 hover:bg-tint/60 hover:text-accent-ink"
                  )}
                >
                  {y.name}{y.isCurrent ? " (current)" : ""}
                </Link>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Classes use the year&apos;s dates (<b>{formatDate(sessYear.startDate)} – {formatDate(sessYear.endDate)}</b>) unless given their own,
            e.g. Nursery–UKG January–December. Students move up automatically the day after their class&apos;s session ends.
          </p>
          <div className="mt-3 space-y-2.5">
            {sessRows.map((r) => (
              <ActionForm key={r.classId} action={saveSession} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-subtle/40 p-3 sm:flex-row sm:items-center sm:bg-transparent sm:border-0 sm:border-b sm:rounded-none sm:p-0 sm:pb-2">
                <input type="hidden" name="yearId" value={sessYear.id} /><input type="hidden" name="classId" value={r.classId} />
                <div className="flex items-center justify-between sm:w-24">
                  <span className="font-semibold text-sm text-ink">{r.className}</span>
                  {r.custom ? (
                    <span className="sm:hidden text-xs font-bold text-accent-ink bg-accent-soft border border-accent/20 px-2 py-0.5 rounded-full">own dates</span>
                  ) : (
                    <span className="sm:hidden text-xs text-gray-400">year&apos;s dates</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <input type="date" name="startDate" defaultValue={r.startDate} disabled={!editing} aria-label={`${r.className} session start`} required className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
                  <span className="text-gray-400 text-xs">to</span>
                  <input type="date" name="endDate" defaultValue={r.endDate} disabled={!editing} aria-label={`${r.className} session end`} data-after="startDate" data-months="12" required className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
                </div>
                <div className="flex items-center gap-2 justify-end pt-1 sm:pt-0">
                  {editing && (
                    <Submit variant="secondary" className="text-xs py-1 px-2.5">Save</Submit>
                  )}
                  {r.custom ? (
                    <>
                      <span className="hidden sm:inline text-xs font-bold text-accent-ink bg-accent-soft border border-accent/20 px-2 py-0.5 rounded-full">own dates</span>
                      {editing && (
                        <Submit variant="secondary" className="text-xs py-1 px-2.5" name="reset" value="1">Reset</Submit>
                      )}
                    </>
                  ) : (
                    <span className="hidden sm:inline text-xs text-gray-400">year&apos;s dates</span>
                  )}
                </div>
              </ActionForm>
            ))}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
