"use client";

import { useMemo, useState } from "react";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import type { ActionState } from "@/lib/action";

export const PRESET_HEADS = [
  { name: "Tuition Fee", code: "TUITION", type: "recurring" },
  { name: "Admission Fee", code: "ADMISSION", type: "one_time" },
  { name: "Examination Fee", code: "EXAM", type: "recurring" },
  { name: "Computer Fee", code: "COMPUTER", type: "recurring" },
  { name: "Development Fee", code: "DEVELOPMENT", type: "recurring" },
  { name: "Annual Charges", code: "ANNUAL", type: "recurring" },
  { name: "Sports Fee", code: "SPORTS", type: "recurring" },
  { name: "Festival Fee", code: "FESTIVAL", type: "recurring" },
  { name: "Electric Fee", code: "ELECTRIC", type: "recurring" },
  { name: "Lab Fee", code: "LAB", type: "recurring" },
  { name: "Transport Fee", code: "TRANSPORT", type: "optional" },
  { name: "Library Fee", code: "LIBRARY", type: "recurring" },
  { name: "Caution Money", code: "CAUTION", type: "one_time", isRefundable: true },
  { name: "Late Fee", code: "LATE_FEE", type: "optional" },
  { name: "ID Card", code: "ID_CARD", type: "optional" },
  { name: "Badge", code: "BADGE", type: "optional" },
  { name: "Tie", code: "TIE", type: "optional" },
  { name: "Belt", code: "BELT", type: "optional" },
  { name: "Book / Diary / Khata", code: "BOOK_KHATA_DIARY", type: "optional" },
  { name: "Transfer Certificate", code: "T_CERTIFICATE", type: "optional" },
  { name: "Admission Form", code: "FORM", type: "optional" },
  { name: "Miscellaneous", code: "MISC", type: "optional" },
] as const;

interface AddFeeHeadSectionProps {
  existingHeads: { id: number; name: string; code: string; type: string }[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}

export function AddFeeHeadSection({ existingHeads, action }: AddFeeHeadSectionProps) {
  const existingCodes = useMemo(
    () => new Set(existingHeads.map((h) => h.code.toUpperCase())),
    [existingHeads]
  );

  const availablePresets = useMemo(
    () => PRESET_HEADS.filter((p) => !existingCodes.has(p.code)),
    [existingCodes]
  );

  const [selected, setSelected] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [category, setCategory] = useState<"recurring" | "one_time" | "optional">("recurring");
  const [isRefundable, setIsRefundable] = useState(false);

  const selectedPreset = useMemo(
    () => PRESET_HEADS.find((p) => p.code === selected),
    [selected]
  );

  const isCustom = selected === "__custom__";

  const handleReset = () => {
    setSelected("");
    setCustomName("");
    setCategory("recurring");
    setIsRefundable(false);
  };

  return (
    <div className="space-y-3">
      <ActionForm action={action} onSuccess={handleReset} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2.5">
          {/* Preset or Custom selection dropdown */}
          <div className="flex flex-col gap-1 min-w-[180px] flex-1">
            <label htmlFor="feehead-preset-select" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Fee Head <span className="text-red-500">*</span>
            </label>
            <select
              id="feehead-preset-select"
              name="preset"
              value={selected}
              onChange={(e) => {
                const val = e.target.value;
                setSelected(val);
                if (val !== "__custom__") {
                  const p = PRESET_HEADS.find((x) => x.code === val);
                  if (p) {
                    setCustomName(p.name);
                    setCategory(p.type as "recurring" | "one_time" | "optional");
                    setIsRefundable(Boolean("isRefundable" in p && p.isRefundable));
                  }
                } else {
                  setCustomName("");
                  setCategory("recurring");
                  setIsRefundable(false);
                }
              }}
              required
              className="w-full"
            >
              <option value="" disabled>Choose fee head…</option>
              {availablePresets.length > 0 && (
                <optgroup label="Preset Fee Heads">
                  {availablePresets.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value="__custom__">➕ Create New Heads</option>
            </select>
          </div>

          {/* Hidden inputs when preset is chosen */}
          {!isCustom && selectedPreset && (
            <>
              <input type="hidden" name="name" value={selectedPreset.name} />
              <input type="hidden" name="code" value={selectedPreset.code} />
            </>
          )}

          <input type="hidden" name="printOnReceipt" value="on" />

          {/* Custom Name input if "Create New Heads" is chosen */}
          {isCustom && (
            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
              <label htmlFor="feehead-custom-name" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                Head Name <span className="text-red-500">*</span>
              </label>
              <input
                id="feehead-custom-name"
                name="customName"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Smart Class Fee"
                autoFocus
                required
              />
            </div>
          )}

          {/* Category Dropdown (Recurring, One-time, Optional) */}
          <div className="flex flex-col gap-1 w-36">
            <label htmlFor="feehead-category-select" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Category
            </label>
            <select
              id="feehead-category-select"
              name="type"
              value={category}
              onChange={(e) => setCategory(e.target.value as "recurring" | "one_time" | "optional")}
            >
              <option value="recurring">Recurring</option>
              <option value="one_time">One-time</option>
              <option value="optional">Optional</option>
            </select>
          </div>

          {/* Refundable Checkbox */}
          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer pb-2.5 select-none">
            <input
              type="checkbox"
              name="isRefundable"
              checked={isRefundable}
              onChange={(e) => setIsRefundable(e.target.checked)}
              className="h-4 w-4 rounded text-accent"
            />
            <span>Refundable</span>
          </label>

          {/* Submit Button */}
          <div className="pb-0.5">
            <Submit variant="primary" disabled={!selected || (isCustom && !customName.trim())}>
              Add Heads
            </Submit>
          </div>
        </div>

        <FieldError name="name" />
        <FieldError name="code" />
      </ActionForm>

      {/* Compact badges of existing heads */}
      <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">Configured heads ({existingHeads.length}):</span>
        {existingHeads.map((h) => (
          <span
            key={h.id}
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
          >
            <span>{h.name}</span>
            <span className="text-[10px] text-gray-400 capitalize">({h.type.replace("_", "-")})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
