"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import type { ActionState } from "@/lib/action";
import { Card, LinkButton } from "@/components/ui";

export interface FeeHeadItem {
  id: number;
  name: string;
  code: string;
  type: string;
  isRefundable?: boolean | null;
  receiptOrder?: number | null;
  receiptLabel?: string | null;
}

export interface StructureItemEntry {
  item: {
    id: number;
    structureId: number;
    feeHeadId: number;
    amount: number;
    frequency: "monthly" | "quarterly" | "half_yearly" | "annual" | "one_time";
    dueDay: number;
    applicableMonths: number[] | null;
  };
  head: FeeHeadItem;
}

const FREQ = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  annual: "Annual",
  one_time: "One-time (new admissions)",
} as const;

function toRupeeStr(p: number): string {
  return `${Math.floor(p / 100)}${p % 100 ? "." + (p % 100).toString().padStart(2, "0") : ""}`;
}

export function StructureHeadForm({
  structureId,
  yearId,
  heads,
  existingItems,
  saveAction,
}: {
  structureId: number;
  yearId?: number;
  heads: FeeHeadItem[];
  existingItems: StructureItemEntry[];
  saveAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const feesUrl = yearId ? `/fees?year=${yearId}&open=add-fee-heads#add-fee-heads` : "/fees?open=add-fee-heads#add-fee-heads";
  const [headQuery, setHeadQuery] = useState("");
  const [selectedHeadId, setSelectedHeadId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "half_yearly" | "annual" | "one_time">("monthly");
  const [dueDay, setDueDay] = useState(10);
  const [months, setMonths] = useState("");
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

  // Filter heads based on search query; if query matches the current selection or is empty, show all active heads
  const filteredHeads = useMemo(() => {
    const q = headQuery.trim().toLowerCase();
    const currentHead = heads.find((h) => h.id === selectedHeadId);
    const currentName = currentHead?.name.toLowerCase();
    const currentLabel = currentHead?.receiptLabel?.toLowerCase();
    if (!q || q === currentName || q === currentLabel) return heads;
    return heads.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.receiptLabel && h.receiptLabel.toLowerCase().includes(q)) ||
        h.code.toLowerCase().includes(q)
    );
  }, [heads, headQuery, selectedHeadId]);

  const selectHead = (h: FeeHeadItem) => {
    setSelectedHeadId(h.id);
    setHeadQuery(h.receiptLabel || h.name);
    setIsOpen(false);
    setHighlightedIndex(-1);

    // If head already exists in structure, prefill its values
    const existing = existingItems.find((x) => x.head.id === h.id);
    if (existing) {
      setAmount(toRupeeStr(existing.item.amount));
      setFrequency(existing.item.frequency);
      setDueDay(existing.item.dueDay ?? 10);
      setMonths(existing.item.applicableMonths?.join(",") ?? "");
    } else {
      setAmount("");
      setFrequency(h.type === "one_time" ? "one_time" : "monthly");
      setDueDay(10);
      setMonths("");
    }
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
      setHighlightedIndex((prev) => (filteredHeads.length > 0 ? (prev + 1) % filteredHeads.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (filteredHeads.length > 0 ? (prev - 1 + filteredHeads.length) % filteredHeads.length : -1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < filteredHeads.length) {
        e.preventDefault();
        selectHead(filteredHeads[highlightedIndex]!);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleReset = () => {
    setHeadQuery("");
    setSelectedHeadId(null);
    setAmount("");
    setFrequency("monthly");
    setDueDay(10);
    setMonths("");
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const summary = existingItems
    .map(({ head, item }) => `${head.name} ${toRupeeStr(item.amount)}`)
    .join(", ");

  return (
    <Card
      title="Add or update a head"
      overflow="visible"
      actions={
        <LinkButton
          href={feesUrl}
          variant="secondary"
          size="sm"
          className="!border-accent/40 !bg-accent-soft/80 !text-accent-ink hover:!bg-accent hover:!text-white font-semibold shadow-xs"
        >
          Manage Fee Heads
        </LinkButton>
      }
    >
      <ActionForm action={saveAction} onSuccess={handleReset} className="flex flex-wrap items-end gap-3 sm:gap-4">
        <input type="hidden" name="structureId" value={structureId} />
        {selectedHeadId != null && <input type="hidden" name="feeHeadId" value={selectedHeadId} />}

        {/* Head Combobox with Auto-Suggest (Same behavior as Add Heads / Add Class) */}
        <div ref={containerRef} className="relative flex flex-col gap-1 min-w-[200px] flex-1">
          <div className="flex items-center justify-between">
            <label htmlFor="structure-feehead-input" className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Head <span className="text-red-500">*</span>
            </label>
            <Link
              href={feesUrl}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink transition hover:bg-accent-soft cursor-pointer"
              title="Add or manage fee heads in Fee Setup"
            >
              Manage Fee Heads
            </Link>
          </div>
          <input
            ref={inputRef}
            id="structure-feehead-input"
            type="text"
            value={headQuery}
            onChange={(e) => {
              const val = e.target.value;
              setHeadQuery(val);
              setIsOpen(true);
              setHighlightedIndex(-1);
              const exact = heads.find(
                (h) =>
                  h.name.toLowerCase() === val.trim().toLowerCase() ||
                  (h.receiptLabel && h.receiptLabel.toLowerCase() === val.trim().toLowerCase())
              );
              if (exact) {
                setSelectedHeadId(exact.id);
                const existing = existingItems.find((x) => x.head.id === exact.id);
                if (existing) {
                  setAmount(toRupeeStr(existing.item.amount));
                  setFrequency(existing.item.frequency);
                  setDueDay(existing.item.dueDay ?? 10);
                  setMonths(existing.item.applicableMonths?.join(",") ?? "");
                }
              } else {
                setSelectedHeadId(null);
              }
            }}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search or select active fee head…"
            autoComplete="off"
            required
            className="w-full text-sm"
          />

          {/* Auto-suggest dropdown menu */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-2xl text-xs">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <span>Active Heads ({heads.length})</span>
                <span className="text-[9px] text-gray-400 font-normal">Select head</span>
              </div>

              {filteredHeads.length > 0 ? (
                filteredHeads.map((h, index) => {
                  const isHighlighted = highlightedIndex === index;
                  const isSelected = selectedHeadId === h.id;
                  const alreadyConfigured = existingItems.some((x) => x.head.id === h.id);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectHead(h);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-gray-50 last:border-b-0 transition ${
                        isHighlighted
                          ? "bg-accent/10 text-accent-ink font-semibold"
                          : isSelected
                          ? "bg-accent-soft/70 text-accent-ink font-medium"
                          : "hover:bg-gray-50 text-gray-800"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-xs">{h.receiptLabel || h.name}</span>
                        {alreadyConfigured && (
                          <span className="rounded bg-emerald-50 px-1 py-0.2 text-[9px] font-semibold text-emerald-700 border border-emerald-200">
                            Configured
                          </span>
                        )}
                        {h.isRefundable && (
                          <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-semibold text-amber-700 border border-amber-200">
                            Refundable
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-gray-500 capitalize bg-gray-100 px-1.5 py-0.5 rounded">
                        {h.type.replace("_", "-")}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2.5 text-center text-xs text-gray-500">
                  No matching active head found.
                </div>
              )}

              {/* Manage Fee Heads link option at bottom of dropdown */}
              <div className="border-t border-gray-100 p-1 bg-subtle/50">
                <Link
                  href={feesUrl}
                  className="w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-1.5 rounded-md text-xs font-semibold text-accent-ink hover:bg-accent-soft transition"
                >
                  <span>Manage Fee Heads</span>
                  <span className="text-[10px] text-gray-400 font-normal">Fee setup →</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Amount ₹ */}
        <label className="flex flex-col gap-1 w-28">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Amount ₹</span>
          <input
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="text-sm"
          />
          <FieldError name="amount" />
        </label>

        {/* Frequency */}
        <label className="flex flex-col gap-1 w-36">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Frequency</span>
          <select
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as any)}
            className="text-sm"
          >
            {Object.entries(FREQ).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        {/* Due day */}
        <label className="flex flex-col gap-1 w-24">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Due day</span>
          <input
            name="dueDay"
            type="number"
            min={1}
            max={28}
            value={dueDay}
            onChange={(e) => setDueDay(Number(e.target.value))}
            className="text-sm"
          />
          <FieldError name="dueDay" />
        </label>

        {/* Months (optional) */}
        <label className="flex flex-col gap-1 w-36">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Months (optional)</span>
          <input
            name="applicableMonths"
            placeholder="e.g. 4,7,10,1"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="text-sm"
          />
          <FieldError name="applicableMonths" />
        </label>

        {/* Submit */}
        <div className="pb-0.5">
          <Submit disabled={!selectedHeadId || !amount.trim()}>Save head</Submit>
        </div>
      </ActionForm>
      <p className="mt-2 text-xs text-gray-500">
        Months are calendar months (1 = Jan). Leave empty to bill by frequency from the start of the academic year. Existing amounts: {summary || "—"}.
      </p>
    </Card>
  );
}

