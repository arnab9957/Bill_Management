"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/action";
import { Card } from "@/components/ui";
import { useFeeHeads, type FeeHeadItem } from "./fee-heads-context";

export interface FeeHeadRow {
  id: number;
  code: string;
  name: string;
  type: string;
  isRefundable: boolean;
  receiptOrder: number | null;
  receiptLabel: string | null;
}

export interface SheetSchool {
  name: string;
  address: string;
  headerSubtitle: string;
  udiseCode: string;
  registrationNote: string;
}

interface ReceiptRowsManagerProps {
  initialHeads: FeeHeadRow[];
  saveRowsAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteHeadAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  school?: SheetSchool;
  logoSrc?: string;
}

function formatCategory(type: string, code?: string, name?: string) {
  if (code === "LATE_FEE" || name?.toLowerCase() === "late fee") return "As per late";
  if (type === "one_time") return "One-time";
  if (type === "recurring") return "Recurring";
  if (type === "optional") return "Optional";
  return type.replace("_", " ");
}

const SAMPLE_AMOUNTS = [2500, 1200, 600, 400, 300, 200, 150, 100];

export function ReceiptRowsManager({
  initialHeads,
  saveRowsAction,
  deleteHeadAction,
  school,
  logoSrc,
}: ReceiptRowsManagerProps) {
  const { startEdit, cancelEdit, editingHead } = useFeeHeads();

  // Sort items: existing receiptOrder first, then any unassigned by name; Late Fee is placed at the end by default. Assign 1..N order
  const getSortedInitial = (heads: FeeHeadRow[]) => {
    const isLateFee = (h: FeeHeadRow) => h.code === "LATE_FEE" || h.name.toLowerCase() === "late fee";
    const nonLate = heads.filter((h) => !isLateFee(h));
    const lateHeads = heads.filter((h) => isLateFee(h));

    const activeNonLate = nonLate
      .filter((h) => h.receiptOrder != null)
      .sort((a, b) => (a.receiptOrder ?? 0) - (b.receiptOrder ?? 0));
    const unassignedNonLate = nonLate
      .filter((h) => h.receiptOrder == null)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Place Late Fee at the very end by default
    const sorted = [...activeNonLate, ...unassignedNonLate, ...lateHeads];
    return sorted.map((h, i) => ({ ...h, receiptOrder: i + 1 }));
  };

  const [items, setItems] = useState<FeeHeadRow[]>(() => getSortedInitial(initialHeads));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep items synchronized when server revalidates initialHeads
  useEffect(() => {
    setItems(getSortedInitial(initialHeads));
  }, [initialHeads]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Auto-save row ordering to server
  const autoSave = async (newItems: FeeHeadRow[]) => {
    setSaveStatus("saving");
    try {
      const fd = new FormData();
      for (let i = 0; i < newItems.length; i++) {
        const h = newItems[i]!;
        fd.append("ids", String(h.id));
        fd.append(`show_${h.id}`, "on");
        fd.append(`order_${h.id}`, String(i + 1));
        fd.append(`label_${h.id}`, h.name);
      }
      const res = await saveRowsAction(null, fd);
      if (res?.ok) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus("idle");
        }, 2200);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  };

  // Move row up
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...items];
    const prev = next[index - 1]!;
    const curr = next[index]!;
    next[index - 1] = curr;
    next[index] = prev;
    const reordered = next.map((h, i) => ({ ...h, receiptOrder: i + 1 }));
    setItems(reordered);
    autoSave(reordered);
  };

  // Move row down
  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const next = [...items];
    const curr = next[index]!;
    const nextItem = next[index + 1]!;
    next[index] = nextItem;
    next[index + 1] = curr;
    const reordered = next.map((h, i) => ({ ...h, receiptOrder: i + 1 }));
    setItems(reordered);
    autoSave(reordered);
  };

  const handleDelete = async (h: FeeHeadRow) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete fee head "${h.name}"?\n\nThis will remove it from fee setups and receipts. Note: Fee heads already used on student bills cannot be deleted.`
    );
    if (!confirmed) return;

    setDeletingId(h.id);
    setDeleteError(null);
    try {
      const fd = new FormData();
      fd.append("id", String(h.id));
      const res = await deleteHeadAction(null, fd);
      if (!res?.ok) {
        const msg = res?.message || "Failed to delete fee head";
        setDeleteError(msg);
        alert(msg);
      } else {
        if (editingHead?.id === h.id) {
          cancelEdit();
        }
        const updated = items.filter((x) => x.id !== h.id).map((x, i) => ({ ...x, receiptOrder: i + 1 }));
        setItems(updated);
        autoSave(updated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error deleting fee head";
      setDeleteError(msg);
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // Calculate sample total for the preview
  const totalSampleRs = items.reduce(
    (sum, _, i) => sum + (SAMPLE_AMOUNTS[i % SAMPLE_AMOUNTS.length] ?? 200),
    0
  );

  const schoolInfo: SheetSchool = school ?? {
    name: "National Public School",
    address: "Station Road, City - 800001",
    headerSubtitle: "(Affiliated to State Board)",
    udiseCode: "10293847561",
    registrationNote: "Recognized by Govt. of Bihar",
  };

  return (
    <div id="active-fee-heads" data-section="active-fee-heads" className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] lg:grid-cols-[1.1fr_0.9fr] items-start scroll-mt-24">
      {/* Left: Active fee heads, you added */}
      <Card title="Active fee heads, you added">
        <div className="space-y-4">
          {/* Top bar with auto-save indicator and reset */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="text-xs text-gray-500">
              Fee heads print in this row order on paper receipts and bills.
              Use <b>▲</b> and <b>▼</b> to change the order.
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "saving" && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                  <svg className="h-3.5 w-3.5 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <span className="text-emerald-500">✓</span> Auto-saved
                </span>
              )}
              {saveStatus === "error" && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                  ⚠️ Error saving
                  <button
                    type="button"
                    onClick={() => autoSave(items)}
                    className="underline hover:text-red-800 ml-1"
                  >
                    Retry
                  </button>
                </span>
              )}
              {saveStatus === "idle" && (
                <span className="text-[11px] text-gray-400">
                  Auto-saved
                </span>
              )}
            </div>
          </div>

          {deleteError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-center justify-between">
              <span>{deleteError}</span>
              <button
                type="button"
                onClick={() => setDeleteError(null)}
                className="text-red-500 hover:text-red-800 font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-20 text-center">Order</th>
                  <th>Fee head</th>
                  <th className="w-28">Category</th>
                  <th className="w-32 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-gray-400">
                      No fee heads configured yet.
                    </td>
                  </tr>
                ) : (
                  items.map((h, index) => {
                    const isCurrentEditing = editingHead?.id === h.id;
                    return (
                      <tr
                        key={h.id}
                        className={`transition-colors ${isCurrentEditing
                            ? "bg-accent/10 hover:bg-accent/15"
                            : "bg-white hover:bg-subtle/70"
                          }`}
                      >
                        {/* Move Up / Down Buttons */}
                        <td className="text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveUp(index)}
                              disabled={index === 0 || saveStatus === "saving"}
                              title="Move up"
                              aria-label={`Move ${h.name} up`}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moveDown(index)}
                              disabled={index >= items.length - 1 || saveStatus === "saving"}
                              title="Move down"
                              aria-label={`Move ${h.name} down`}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
                            >
                              ▼
                            </button>
                          </div>
                        </td>

                        {/* Fee Head Name */}
                        <td>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-ink">
                              {h.name}
                            </span>
                            {isCurrentEditing && (
                              <span className="rounded bg-accent text-white px-1.5 py-0.5 text-[10px] font-bold">
                                Editing
                              </span>
                            )}
                            {h.isRefundable && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                Refundable
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          <span className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                            h.code === "LATE_FEE" || h.name.toLowerCase() === "late fee"
                              ? "bg-amber-100 text-amber-900 border border-amber-200"
                              : "bg-gray-100 text-gray-700"
                          }`}>
                            {formatCategory(h.type, h.code, h.name)}
                          </span>
                        </td>

                        {/* Edit & Delete Actions */}
                        <td className="text-center">
                          {h.code === "LATE_FEE" || h.name.toLowerCase() === "late fee" ? (
                            <a
                              href="#late-fee-rule"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-accent-ink hover:bg-accent-soft transition"
                              title="Jump to Late Fee rule setup below"
                            >
                              Rule setup ↓
                            </a>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startEdit(h)}
                                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:border-accent hover:bg-accent-soft hover:text-accent-ink transition shadow-2xs"
                                title={`Edit ${h.name}`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(h)}
                                disabled={deletingId === h.id}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-800 transition shadow-2xs disabled:opacity-40"
                                title={`Delete ${h.name}`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                <span>{deletingId === h.id ? "…" : "Delete"}</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Right: Live Print Receipt Format Preview */}
      <div className="sticky top-4">
        <Card
          title="Print format preview"
          actions={
            <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink border border-accent/20">
              ● Live preview
            </span>
          }
        >
          <div className="space-y-2">
            <div className="text-[11px] text-gray-500">
              Fee heads will appear in this exact order on printed student receipts and fee bills:
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4 overflow-x-auto flex justify-center">
              <div className="w-full max-w-[420px] bg-white rounded-lg shadow-sm border border-gray-300 p-4 text-xs font-serif text-black select-none">
                {/* Receipt Header */}
                <div className="flex justify-between text-[10px] font-sans text-gray-600 mb-1.5 border-b border-gray-100 pb-1">
                  <span>Receipt No: <strong>RCT/2026-27/001</strong></span>
                  <span>Date: <strong>{new Date().toLocaleDateString("en-IN")}</strong></span>
                </div>

                {logoSrc && (
                  <div className="flex justify-center mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoSrc} alt="School Logo" className="h-8 max-w-[120px] object-contain" />
                  </div>
                )}

                {/* Banner */}
                <div className="bg-black text-white text-center font-bold text-xs uppercase tracking-wide py-1 px-2 mb-1 rounded-xs">
                  {schoolInfo.name?.trim() ? schoolInfo.name : "—"}
                </div>

                {/* School lines */}
                <div className="text-center text-[10px] leading-tight text-gray-600 mb-2 font-sans space-y-0.5">
                  <div>{schoolInfo.headerSubtitle?.trim() ? schoolInfo.headerSubtitle : "—"}</div>
                  <div className="font-semibold">
                    {schoolInfo.udiseCode?.trim() ? `U-Dise Code- ${schoolInfo.udiseCode}` : "U-Dise Code- —"}
                  </div>
                  <div>{schoolInfo.address?.trim() ? schoolInfo.address : "—"}</div>
                </div>

                {/* Student Details Grid */}
                <table className="w-full border-collapse border border-black text-[11px]">
                  <tbody>
                    <tr className="border-b border-black">
                      <td colSpan={4} className="p-1 font-sans text-[10px]">
                        <strong>Name :</strong> Sample Student
                      </td>
                    </tr>
                    <tr className="border-b border-black font-sans text-[10px]">
                      <td className="p-1 border-r border-black" style={{ width: "38%" }}><strong>Class :</strong> V</td>
                      <td className="p-1 border-r border-black" style={{ width: "24%" }}><strong>Sec-</strong> A</td>
                      <td colSpan={2} className="p-1"><strong>Roll :</strong> 12</td>
                    </tr>
                    <tr className="bg-gray-100/90 font-bold text-center border-b border-black text-[10px]">
                      <td className="p-1 border-r border-black text-left">Details of Receipt</td>
                      <td className="p-1 border-r border-black">Period</td>
                      <td className="p-1 border-r border-black" style={{ width: "22%" }}>Rs.</td>
                      <td className="p-1" style={{ width: "12%" }}>P.</td>
                    </tr>

                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-3 text-center text-gray-400 font-sans text-[11px]">
                          No fee heads added yet
                        </td>
                      </tr>
                    ) : (
                      items.map((h, i) => {
                        const isLast = i === items.length - 1;
                        const isCurrentEditing = editingHead?.id === h.id;
                        const amount = SAMPLE_AMOUNTS[i % SAMPLE_AMOUNTS.length] ?? 200;
                        return (
                          <tr
                            key={h.id}
                            className={`border-b ${isLast ? "border-b-black" : "border-b-gray-300"} text-[11px] transition-colors ${isCurrentEditing ? "bg-accent/10 font-bold" : ""
                              }`}
                          >
                            <td className="px-1.5 py-1 border-r border-black truncate max-w-[150px]" title={h.name}>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="truncate">{h.name}</span>
                                {h.isRefundable && (
                                  <span className="shrink-0 rounded border border-black/70 px-1 py-0.5 text-[7px] leading-none font-sans font-semibold tracking-tight text-black">
                                    Refundable
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-1 py-1 border-r border-black text-center text-[10px] text-gray-500 font-sans">
                              {h.type === "recurring" ? "Apr–Jun" : "—"}
                            </td>
                            <td className="px-1.5 py-1 border-r border-black text-right tabular-nums">
                              {amount}
                            </td>
                            <td className="px-1 py-1 text-right tabular-nums">00</td>
                          </tr>
                        );
                      })
                    )}

                    <tr className="font-bold border-t border-black bg-gray-50/50">
                      <td className="border-r border-black" />
                      <td className="p-1 border-r border-black text-right italic text-[10px]">Total</td>
                      <td className="p-1 border-r border-black text-right tabular-nums font-mono text-xs">
                        {totalSampleRs}
                      </td>
                      <td className="p-1 text-right tabular-nums font-mono text-xs">00</td>
                    </tr>
                  </tbody>
                </table>

                {/* Words & Signatures */}
                <div className="mt-2 text-[10px] text-gray-600 border-t border-gray-100 pt-1 font-sans">
                  <div className="flex gap-1">
                    <span className="font-semibold text-gray-700">Rupees:</span>
                    <span className="italic">Sample Fee Receipt Amount</span>
                  </div>
                  <div className="mt-4 flex justify-between text-[10px] text-gray-700 pt-2 border-t border-dashed border-gray-200">
                    <span>Checked by</span>
                    <span className="text-right">Received by (Cashier)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
