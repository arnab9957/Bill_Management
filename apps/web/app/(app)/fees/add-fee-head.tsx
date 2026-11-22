"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import type { ActionState } from "@/lib/action";
import { Card } from "@/components/ui";
import { useFeeHeads, type FeeHeadItem } from "./fee-heads-context";

export interface PresetFeeHead {
  name: string;
  code: string;
  type: "recurring" | "one_time" | "optional";
  isRefundable?: boolean;
  keywords: string[];
}

export const PRESET_HEADS: PresetFeeHead[] = [
  { name: "Tuition Fee", code: "TUITION", type: "recurring", keywords: ["tuition", "tution", "school fee", "monthly fee", "class fee", "monthly", "tuition fees", "study"] },
  { name: "Admission Fee", code: "ADMISSION", type: "one_time", keywords: ["admission", "enrollment", "registration", "entry fee", "new admission", "admit"] },
  { name: "Examination Fee", code: "EXAM", type: "recurring", keywords: ["examination", "exam", "test", "assessment", "term exam", "eval", "evaluation", "exam fee"] },
  { name: "Computer Fee", code: "COMPUTER", type: "recurring", keywords: ["computer", "it", "informatics", "coding", "software", "comp", "computer lab"] },
  { name: "Development Fee", code: "DEVELOPMENT", type: "recurring", keywords: ["development", "building", "infrastructure", "campus", "fund", "bldg"] },
  { name: "Annual Charges", code: "ANNUAL", type: "recurring", keywords: ["annual", "yearly", "session charges", "annual fee", "yearly fee", "session fee", "annual charge"] },
  { name: "Sports Fee", code: "SPORTS", type: "recurring", keywords: ["sports", "games", "athletics", "physical education", "pe", "activity", "activities", "play"] },
  { name: "Festival Fee", code: "FESTIVAL", type: "recurring", keywords: ["festival", "celebration", "function", "event", "cultural", "fest", "puja"] },
  { name: "Electric Fee", code: "ELECTRIC", type: "recurring", keywords: ["electric", "electricity", "power", "generator", "utility", "light", "energy", "gen"] },
  { name: "Lab Fee", code: "LAB", type: "recurring", keywords: ["lab", "laboratory", "science", "physics", "chemistry", "biology", "practical"] },
  { name: "Transport Fee", code: "TRANSPORT", type: "optional", keywords: ["transport", "bus", "van", "auto", "vehicle", "cab", "conveyance", "fare", "bus fee", "van fee", "travel"] },
  { name: "Library Fee", code: "LIBRARY", type: "recurring", keywords: ["library", "books", "reading", "reading room", "lib", "libr"] },
  { name: "Caution Money", code: "CAUTION", type: "one_time", isRefundable: true, keywords: ["caution", "security", "security deposit", "deposit", "refundable deposit", "caution money"] },
  { name: "Late Fee", code: "LATE_FEE", type: "optional", keywords: ["late", "fine", "penalty", "delay", "overdue", "charges on fine", "late fine"] },
  { name: "ID Card", code: "ID_CARD", type: "optional", keywords: ["id", "id card", "identity", "identity card", "smart card", "student card", "i-card"] },
  { name: "Badge", code: "BADGE", type: "optional", keywords: ["badge", "pin", "school badge", "monogram", "logo badge"] },
  { name: "Tie", code: "TIE", type: "optional", keywords: ["tie", "necktie", "school tie", "uniform tie"] },
  { name: "Belt", code: "BELT", type: "optional", keywords: ["belt", "waist belt", "school belt", "uniform belt"] },
  { name: "Book+Khata+Diary", code: "BOOK_KHATA_DIARY", type: "optional", keywords: ["book", "diary", "khata", "notebook", "stationery", "copy", "copies", "school diary", "books", "book+khata+diary", "book / diary / khata", "book khata diary"] },
  { name: "T.Certificate", code: "T_CERTIFICATE", type: "optional", keywords: ["transfer", "tc", "slc", "school leaving", "leaving certificate", "migration", "t.c.", "t.c", "t.certificate", "t certificate", "transfer certificate"] },
  { name: "Form", code: "FORM", type: "optional", keywords: ["form", "prospectus", "admission form", "application form", "registration form", "school form"] },
  { name: "Miscellaneous", code: "MISC", type: "optional", keywords: ["misc", "miscellaneous", "other", "extra", "general", "sundry"] },
];

const SYSTEM_CODES = new Set(["TRANSPORT", "LATE_FEE", "BOUNCE", "OPENING"]);

interface FeeHeadFormCardProps {
  existingHeads: FeeHeadItem[];
  addAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  editAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}

export function FeeHeadFormCard({ existingHeads, addAction, editAction }: FeeHeadFormCardProps) {
  const { editingHead, cancelEdit, formCardRef } = useFeeHeads();

  return (
    <div ref={formCardRef} className="relative z-30 w-full">
      <Card
        title={editingHead ? `Edit Fee Head: ${editingHead.name}` : "Add Fee Heads"}
        overflow="visible"
        actions={
          editingHead ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50"
            >
              ✕ Cancel edit
            </button>
          ) : undefined
        }
      >
        {editingHead ? (
          <EditFeeHeadForm
            key={editingHead.id}
            head={editingHead}
            action={editAction}
            onCancel={cancelEdit}
          />
        ) : (
          <AddFeeHeadForm
            existingHeads={existingHeads}
            action={addAction}
          />
        )}

        {/* Compact badges of existing heads */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">Configured heads ({existingHeads.length}):</span>
          {existingHeads.map((h) => {
            const isCurrent = editingHead?.id === h.id;
            return (
              <span
                key={h.id}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  isCurrent
                    ? "bg-accent-soft text-accent-ink border border-accent/40 font-bold"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                <span>{h.name}</span>
                <span className="text-[10px] text-gray-400 capitalize">({h.type.replace("_", "-")})</span>
              </span>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// Backward-compatibility alias
export const AddFeeHeadSection = FeeHeadFormCard;

function EditFeeHeadForm({
  head,
  action,
  onCancel,
}: {
  head: FeeHeadItem;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(head.name);
  const [category, setCategory] = useState<"recurring" | "one_time" | "optional">(
    head.type as "recurring" | "one_time" | "optional"
  );
  const [isRefundable, setIsRefundable] = useState(head.isRefundable);

  const isSystem = SYSTEM_CODES.has(head.code.toUpperCase());

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-amber-50/80 border border-amber-200/80 p-2.5 text-xs text-amber-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            Editing fee head <strong>{head.name}</strong>
          </span>
          <span className="rounded bg-amber-100/90 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 border border-amber-200">
            {isSystem ? "System Head: " : "Code: "}{head.code}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-amber-800 underline font-semibold hover:text-amber-950 shrink-0"
        >
          Cancel
        </button>
      </div>

      <ActionForm
        action={action}
        onSuccess={() => {
          onCancel();
        }}
        className="space-y-3"
      >
        <input type="hidden" name="id" value={head.id} />
        {/* Internal code is preserved automatically so users don't need to manually type or edit codes */}
        <input type="hidden" name="code" value={head.code} />

        <div className="flex flex-wrap items-end gap-2.5">
          {/* Head Name */}
          <div className="flex flex-col gap-1 min-w-[200px] flex-1">
            <label htmlFor="edit-feehead-name" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Head Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-feehead-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tuition Fee"
              autoFocus
              required
              className="w-full"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1 w-36">
            <label htmlFor="edit-feehead-category" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Category
            </label>
            <select
              id="edit-feehead-category"
              name="type"
              value={category}
              onChange={(e) => setCategory(e.target.value as "recurring" | "one_time" | "optional")}
              className="w-full"
            >
              <option value="recurring">Recurring</option>
              <option value="one_time">One-time</option>
              <option value="optional">Optional</option>
            </select>
          </div>

          {/* Refundable */}
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

          {/* Submit & Cancel Buttons */}
          <div className="flex items-center gap-2 pb-0.5">
            <Submit variant="primary" disabled={!name.trim()}>
              Save Changes
            </Submit>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>

        <FieldError name="name" />
      </ActionForm>
    </div>
  );
}

function matchesPreset(p: PresetFeeHead, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (p.name.toLowerCase().includes(q)) return true;
  if (p.code.toLowerCase().includes(q)) return true;
  return p.keywords.some((k) => k.includes(q) || q.includes(k));
}

function scorePreset(p: PresetFeeHead, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const nameLower = p.name.toLowerCase();
  const codeLower = p.code.toLowerCase();
  if (nameLower === q) return 100;
  if (codeLower === q) return 95;
  if (p.keywords.some((k) => k.toLowerCase() === q)) return 90;
  if (nameLower.startsWith(q)) return 80;
  if (codeLower.startsWith(q)) return 70;
  if (nameLower.includes(q)) return 60;
  if (p.keywords.some((k) => k.toLowerCase().startsWith(q))) return 50;
  if (codeLower.includes(q)) return 40;
  if (p.keywords.some((k) => k.toLowerCase().includes(q))) return 30;
  if (p.keywords.some((k) => q.includes(k.toLowerCase()))) return 20;
  return 0;
}

function AddFeeHeadForm({
  existingHeads,
  action,
}: {
  existingHeads: FeeHeadItem[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const existingCodes = useMemo(
    () => new Set(existingHeads.map((h) => h.code.toUpperCase())),
    [existingHeads]
  );

  const availablePresets = useMemo(
    () => PRESET_HEADS.filter((p) => !existingCodes.has(p.code)),
    [existingCodes]
  );

  const [headName, setHeadName] = useState("");
  const [selectedPresetCode, setSelectedPresetCode] = useState("");
  const [category, setCategory] = useState<"recurring" | "one_time" | "optional">("recurring");
  const [isRefundable, setIsRefundable] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter and rank presets by name, code, and semantic keywords
  const filteredPresets = useMemo(() => {
    const q = headName.trim();
    if (!q) return availablePresets;
    return availablePresets
      .filter((p) => matchesPreset(p, q))
      .sort((a, b) => scorePreset(b, q) - scorePreset(a, q));
  }, [availablePresets, headName]);

  const hasExactMatch = useMemo(() => {
    const q = headName.trim().toLowerCase();
    return availablePresets.some((p) =>
      p.name.toLowerCase() === q ||
      p.code.toLowerCase() === q ||
      p.keywords.some((k) => k.toLowerCase() === q)
    );
  }, [availablePresets, headName]);

  const showCustomOption = Boolean(headName.trim() && !hasExactMatch);
  const totalOptions = filteredPresets.length + (showCustomOption ? 1 : 0);

  const selectPreset = (p: PresetFeeHead) => {
    setHeadName(p.name);
    setSelectedPresetCode(p.code);
    setCategory(p.type);
    setIsRefundable(Boolean(p.isRefundable));
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const selectCustom = (name: string) => {
    setHeadName(name);
    setSelectedPresetCode("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleReset = () => {
    setHeadName("");
    setSelectedPresetCode("");
    setCategory("recurring");
    setIsRefundable(false);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (totalOptions > 0 ? (prev + 1) % totalOptions : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (totalOptions > 0 ? (prev - 1 + totalOptions) % totalOptions : -1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredPresets.length) {
        e.preventDefault();
        selectPreset(filteredPresets[highlightedIndex]!);
      } else if (showCustomOption && highlightedIndex === filteredPresets.length) {
        e.preventDefault();
        selectCustom(headName.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      <ActionForm action={action} onSuccess={handleReset} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2.5">
          {/* Fee Head Text Input with Auto-Suggest Combobox (No search-clear icon) */}
          <div ref={containerRef} className="relative flex flex-col gap-1 min-w-[220px] flex-1">
            <label htmlFor="feehead-name-input" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Fee Head <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              id="feehead-name-input"
              type="text"
              name="name"
              value={headName}
              onChange={(e) => {
                const val = e.target.value;
                setHeadName(val);
                setIsOpen(true);
                setHighlightedIndex(-1);
                const exact = availablePresets.find((p) =>
                  p.name.toLowerCase() === val.trim().toLowerCase() ||
                  p.code.toLowerCase() === val.trim().toLowerCase() ||
                  p.keywords.some((k) => k.toLowerCase() === val.trim().toLowerCase())
                );
                if (exact) {
                  setSelectedPresetCode(exact.code);
                  setCategory(exact.type);
                  setIsRefundable(Boolean(exact.isRefundable));
                } else {
                  setSelectedPresetCode("");
                }
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search preset or type new fee head…"
              autoComplete="off"
              required
              className="w-full text-sm"
            />

            {/* Hidden code input if a preset was matched/selected */}
            {selectedPresetCode && (
              <input type="hidden" name="code" value={selectedPresetCode} />
            )}

            <input type="hidden" name="printOnReceipt" value="on" />

            {/* Auto-suggest dropdown menu (not constrained by card height) */}
            {isOpen && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 sm:max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-2xl text-xs"
              >
                {/* Header hint */}
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <span>{headName.trim() ? "Suggestions & Matching Presets" : "Available Presets"}</span>
                  <span className="text-[9px] text-gray-400 font-normal">Select or type custom</span>
                </div>

                {filteredPresets.length > 0 ? (
                  filteredPresets.map((p, index) => {
                    const isHighlighted = highlightedIndex === index;
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectPreset(p);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-50 last:border-b-0 transition ${
                          isHighlighted
                            ? "bg-accent/10 text-accent-ink font-semibold"
                            : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-xs">{p.name}</span>
                          {p.isRefundable && (
                            <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-semibold text-amber-700 border border-amber-200">
                              Refundable
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                          {p.type.replace("_", "-")}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2.5 text-center text-xs text-gray-500">
                    No matching preset found.
                  </div>
                )}

                {/* Custom Fee Head option when typing a unique name */}
                {showCustomOption && (
                  <div className="border-t border-gray-100 p-1 bg-subtle/50">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectCustom(headName.trim());
                      }}
                      className={`w-full text-left px-2.5 py-1.5 flex items-center gap-1.5 rounded-md text-xs font-semibold transition ${
                        highlightedIndex === filteredPresets.length
                          ? "bg-accent text-white"
                          : "text-accent-ink hover:bg-accent-soft"
                      }`}
                    >
                      <span>➕</span>
                      <span>
                        Use custom head: <strong>&ldquo;{headName.trim()}&rdquo;</strong>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

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
              className="w-full text-sm"
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
            <Submit variant="primary" disabled={!headName.trim()}>
              Add Heads
            </Submit>
          </div>
        </div>

        <FieldError name="name" />
        <FieldError name="code" />
      </ActionForm>
    </div>
  );
}
