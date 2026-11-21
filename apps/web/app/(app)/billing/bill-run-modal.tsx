"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ActionForm, Submit, useActionResult } from "@/components/action-form";
import { Button, buttonClass, cx, Notice } from "@/components/ui";
import { formatDate, formatINR, periodLabel, periodOf, today } from "@sb/core/src/money-dates-client";
import { runBilling } from "./actions";

interface ClassItem {
  id: number;
  name: string;
}

interface YearItem {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

interface BillRunModalProps {
  classes: ClassItem[];
  year: YearItem;
  defaultOpen?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
}

type PlannedLine = { description: string; net: number };
type PlannedItem = {
  studentId: number;
  admissionNo: string;
  name: string;
  className: string;
  dueDate: string;
  net: number;
  lines: PlannedLine[];
};

type RunResultData = {
  dryRun: boolean;
  yearName: string;
  totalNet: number;
  planned: PlannedItem[];
  skipped: { studentId: number; name: string; reason: string }[];
  created: { invoiceId: number; invoiceNo: string }[];
};

export function RunResult({ onClose }: { onClose?: () => void }) {
  const s = useActionResult();
  const resultRef = useRef<HTMLDivElement>(null);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    if (s?.ok && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [s]);

  if (!s?.ok) return null;
  const r = s.data as RunResultData;
  if (!r) return null;

  const filteredPlanned = r.planned.filter((p) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.admissionNo.toLowerCase().includes(q) ||
      p.className.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={resultRef} className="mt-6 space-y-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:p-5">
      {/* Header status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-3">
        <div className="flex items-center gap-2">
          {r.dryRun ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-800">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              Preview Mode (Dry Run)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Bills Generated Successfully
            </span>
          )}
          <span className="text-xs text-gray-500 font-medium">Session: {r.yearName}</span>
        </div>
        {!r.dryRun && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 transition"
          >
            Done · View Bills
          </button>
        )}
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            {r.dryRun ? "Would Create" : "Created"}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-ink tabular-nums">
              {r.dryRun ? r.planned.length : r.created.length}
            </span>
            <span className="text-xs text-gray-500">bills</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Net Amount</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-accent-ink tabular-nums">
              {formatINR(r.totalNet)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Skipped Students</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${r.skipped.length > 0 ? "text-amber-700" : "text-gray-700"}`}>
              {r.skipped.length}
            </span>
            <span className="text-xs text-gray-500">skipped</span>
          </div>
        </div>
      </div>

      {/* Planned list or empty message */}
      {r.planned.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
              {r.dryRun ? "Planned Invoices" : "Generated Invoices"} ({r.planned.length})
            </h3>
            {r.planned.length > 5 && (
              <input
                type="search"
                placeholder="Search by student, adm no, class..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="h-8 w-60 rounded-lg border border-gray-300 bg-white px-2.5 text-xs text-ink placeholder:text-gray-400 focus:border-accent"
              />
            )}
          </div>

          <div className="max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="data">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-xs">
                <tr>
                  <th>Adm. no.</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Heads</th>
                  <th>Due</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlanned.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-xs text-gray-500">
                      No matching students found for &ldquo;{filterQuery}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredPlanned.map((p) => (
                    <tr key={p.studentId} className="hover:bg-subtle/70">
                      <td className="font-mono text-xs">{p.admissionNo}</td>
                      <td className="font-medium text-ink">{p.name}</td>
                      <td>
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {p.className}
                        </span>
                      </td>
                      <td className="wrap text-xs text-gray-600">
                        {p.lines.map((l) => l.description.replace(/ – .*$/, "")).join(", ")}
                      </td>
                      <td className="text-xs text-gray-600">{formatDate(p.dueDate)}</td>
                      <td className="num font-semibold text-ink">{formatINR(p.net)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-xs text-gray-500">
          No new bills to generate for this month/class selection. All students may have already been billed, or no active students with fee structures were found.
        </div>
      )}

      {/* Skipped students */}
      {r.skipped.length > 0 && (
        <details className="group rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 text-xs text-amber-950">
          <summary className="cursor-pointer font-semibold select-none flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span> Skipped students ({r.skipped.length})
            </span>
            <span className="text-[11px] font-normal text-amber-800 group-open:hidden">Click to view details</span>
          </summary>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-amber-200/50 bg-white p-2">
            <ul className="divide-y divide-gray-100">
              {r.skipped.map((x) => (
                <li key={x.studentId} className="py-1.5 px-2 flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-ink">{x.name}</span>
                  <span className="text-gray-500">{x.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}

export function BillRunModal({
  classes,
  year,
  defaultOpen = false,
  triggerLabel = "Run billing",
  triggerClassName,
}: BillRunModalProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  const now = periodOf(today());
  const minPeriod = periodOf(year.startDate);
  const maxPeriod = periodOf(year.endDate);
  const initialPeriod = now >= minPeriod && now <= maxPeriod ? now : minPeriod;

  const [period, setPeriod] = useState(initialPeriod);
  const [selectedClasses, setSelectedClasses] = useState<Set<number>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync if defaultOpen changes
  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  // Lock body scroll and handle Escape key while modal is open
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    // Remove ?billrun= from URL cleanly if present
    if (typeof window !== "undefined" && window.location.search.includes("billrun")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("billrun");
      const nextSearch = url.searchParams.toString();
      const nextUrl = url.pathname + (nextSearch ? `?${nextSearch}` : "");
      window.history.replaceState({}, "", nextUrl);
    }
  };

  const handleSelectAll = () => {
    setSelectedClasses(new Set(classes.map((c) => c.id)));
  };

  const handleClearClasses = () => {
    setSelectedClasses(new Set());
  };

  const toggleClass = (id: number) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        className={cx("gap-2 shadow-sm font-medium", triggerClassName)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span>{triggerLabel}</span>
      </Button>

      {mounted && open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={closeModal}
            aria-hidden="true"
          />

          {/* Dialog Container */}
          <div
            className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200/80 bg-subtle/80 px-6 py-4.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink border border-accent/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
                    <line x1="8" y1="7" x2="16" y2="7" />
                    <line x1="8" y1="11" x2="16" y2="11" />
                    <line x1="8" y1="15" x2="13" y2="15" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id={titleId} className="text-lg font-bold text-ink">
                      Bill Run
                    </h2>
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
                      Session {year.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Generate or preview monthly invoices for enrolled students
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                aria-label="Close dialog"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <Notice tone="info" className="text-xs">
                Active students enrolled in <b>{year.name}</b> are billed using their {year.name} class and fee structure.
                Always <b>Preview</b> first. Re-running a month is safe and never creates duplicates — students already billed are skipped.
              </Notice>

              <ActionForm action={runBilling} className="space-y-5">
                <div className="rounded-xl border border-gray-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-4">
                  {/* Month Picker Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="billrun-month" className="text-xs font-bold uppercase tracking-wider text-gray-700">
                        Billing Month <span className="text-red-500">*</span>
                      </label>
                      <span className="text-xs text-gray-500">
                        Invoices will be dated and scheduled for this period
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        id="billrun-month"
                        type="month"
                        name="period"
                        value={period}
                        min={minPeriod}
                        max={maxPeriod}
                        onChange={(e) => setPeriod(e.target.value)}
                        required
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-ink shadow-xs focus:border-accent"
                      />
                      <span className="rounded-md bg-subtle px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200">
                        {periodLabel(period)}
                      </span>
                    </div>
                  </div>

                  {/* Class Selection */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          Target Classes
                        </span>
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                          {selectedClasses.size === 0
                            ? "All classes (default)"
                            : `${selectedClasses.size} of ${classes.length} selected`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAll}
                          className="text-xs font-semibold text-accent-ink hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          type="button"
                          onClick={handleClearClasses}
                          className="text-xs font-semibold text-gray-500 hover:text-gray-800"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500">
                      Leave all unchecked to bill every class in session {year.name}, or choose specific classes below.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                      {classes.map((c) => {
                        const checked = selectedClasses.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cx(
                              "flex items-center gap-2.5 rounded-lg border p-2.5 text-xs font-medium transition cursor-pointer select-none",
                              checked
                                ? "border-accent bg-accent-soft/50 text-accent-ink font-semibold shadow-xs"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                            )}
                          >
                            <input
                              type="checkbox"
                              name="classIds"
                              value={c.id}
                              checked={checked}
                              onChange={() => toggleClass(c.id)}
                              className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                            />
                            <span className="truncate">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions inside form */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-500">
                      Recommended: Run <b>Preview</b> first to inspect fees and students.
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="submit"
                        name="intent"
                        value="preview"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:border-accent hover:bg-accent-soft hover:text-accent-ink transition"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        <span>Preview bills</span>
                      </button>

                      <Submit
                        name="intent"
                        value="commit"
                        confirm="Generate bills now? This will issue invoices to students."
                        variant="primary"
                        className="inline-flex items-center gap-1.5"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Generate bills</span>
                      </Submit>
                    </div>
                  </div>
                </div>

                {/* Live Run Result */}
                <RunResult onClose={closeModal} />
              </ActionForm>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-200/80 bg-gray-50 px-6 py-3.5">
              <span className="text-xs text-gray-500">
                Academic Session: <b>{year.name}</b>
              </span>
              <button
                type="button"
                onClick={closeModal}
                className={buttonClass("secondary", "sm")}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
