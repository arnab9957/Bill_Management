"use client";

import { useState } from "react";
import type { schoolSettings } from "@sb/db";

type SchoolSettings = typeof schoolSettings.$inferSelect;
import { FieldError } from "@/components/action-form";

const field = "flex flex-col gap-1.5 text-sm";

export function NumberingFormatFields({
  s,
  currentYear,
}: {
  s: SchoolSettings;
  currentYear?: { name: string; startDate: string };
}) {
  const [admPrefix, setAdmPrefix] = useState(s.admissionPrefix ?? "");
  const [admIncludeYear, setAdmIncludeYear] = useState(s.admissionIncludeYear ?? "none");
  const [admSeparator, setAdmSeparator] = useState(s.admissionSeparator ?? "/");
  const [admDigits, setAdmDigits] = useState(s.admissionDigits ?? 4);
  const [admStartNum, setAdmStartNum] = useState(s.admissionStartNumber ?? 1);

  const [rollDigits, setRollDigits] = useState(s.rollDigits ?? 1);
  const [rollPrefixSec, setRollPrefixSec] = useState(Boolean(s.rollPrefixSection));
  const [rollStartNum, setRollStartNum] = useState(s.rollStartNumber ?? 1);

  // Compute live admission preview
  const yearStr = currentYear?.startDate?.slice(0, 4) || "2026";
  const sessionStr = currentYear?.name || "2026-27";
  const prefixText = admPrefix.trim();
  const sep = admSeparator === "none" ? "" : admSeparator;

  let yearPart = "";
  if (admIncludeYear === "year") yearPart = yearStr;
  else if (admIncludeYear === "session") yearPart = sessionStr;

  let expectedAdmPrefix = "";
  if (prefixText && yearPart) {
    expectedAdmPrefix = `${prefixText}${sep}${yearPart}${sep}`;
  } else if (prefixText && !yearPart) {
    expectedAdmPrefix = `${prefixText}${sep === "/" ? "" : sep}`;
  } else if (!prefixText && yearPart) {
    expectedAdmPrefix = `${yearPart}${sep}`;
  }

  const sampleAdmNo = `${expectedAdmPrefix}${String(admStartNum).padStart(admDigits, "0")}`;

  // Compute live roll preview
  const sampleRollNo = `${rollPrefixSec ? "A-" : ""}${String(rollStartNum).padStart(rollDigits, "0")}`;

  return (
    <div className="space-y-6 sm:col-span-2">
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-700">Admission number format</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={field}>
            <span className="font-medium text-gray-900">Prefix</span>
            <input
              name="admissionPrefix"
              value={admPrefix}
              maxLength={16}
              placeholder="e.g. ADM or A or leave blank"
              onChange={(e) => setAdmPrefix(e.target.value)}
            />
            <FieldError name="admissionPrefix" />
          </label>

          <label className={field}>
            <span className="font-medium text-gray-900">Include year</span>
            <select
              name="admissionIncludeYear"
              value={admIncludeYear}
              onChange={(e) => setAdmIncludeYear(e.target.value as "none" | "year" | "session")}
            >
              <option value="none">No year (e.g. ADM0001, A1001)</option>
              <option value="year">Calendar year (e.g. 2026)</option>
              <option value="session">Academic session (e.g. 2026-27)</option>
            </select>
          </label>

          <label className={field}>
            <span className="font-medium text-gray-900">Separator</span>
            <select
              name="admissionSeparator"
              value={admSeparator}
              onChange={(e) => setAdmSeparator(e.target.value)}
            >
              <option value="/">Slash (/)</option>
              <option value="-">Dash (-)</option>
              <option value="none">None</option>
            </select>
          </label>

          <label className={field}>
            <span className="font-medium text-gray-900">Number padding digits</span>
            <input
              type="number"
              name="admissionDigits"
              min={1}
              max={8}
              value={admDigits}
              onChange={(e) => setAdmDigits(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <label className={field}>
            <span className="font-medium text-gray-900">Starting number</span>
            <input
              type="number"
              name="admissionStartNumber"
              min={1}
              value={admStartNum}
              onChange={(e) => setAdmStartNum(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <div className="flex flex-col justify-end">
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs">
              <span className="font-semibold text-sky-900">Generated sample:</span>
              <div className="mt-0.5 font-mono text-sm font-bold text-sky-950">{sampleAdmNo}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-700">Roll number format</h4>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={field}>
            <span className="font-medium text-gray-900">Number padding digits</span>
            <select
              name="rollDigits"
              value={rollDigits}
              onChange={(e) => setRollDigits(Number(e.target.value) || 1)}
            >
              <option value={1}>1 digit (1, 2, 3...)</option>
              <option value={2}>2 digits (01, 02, 03...)</option>
              <option value={3}>3 digits (001, 002, 003...)</option>
            </select>
          </label>

          <label className={field}>
            <span className="font-medium text-gray-900">Starting roll number</span>
            <input
              type="number"
              name="rollStartNumber"
              min={1}
              value={rollStartNum}
              onChange={(e) => setRollStartNum(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>

          <div className="flex flex-col justify-end">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <span className="font-semibold text-emerald-900">Generated sample:</span>
              <div className="mt-0.5 font-mono text-sm font-bold text-emerald-950">{sampleRollNo}</div>
            </div>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                name="rollPrefixSection"
                checked={rollPrefixSec}
                onChange={(e) => setRollPrefixSec(e.target.checked)}
              />
              <span>Prefix roll number with section name when section is selected (e.g. A-1, A-2)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
