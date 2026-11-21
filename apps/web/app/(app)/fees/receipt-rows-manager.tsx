"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import type { ActionState } from "@/lib/action";

export interface FeeHeadRow {
  id: number;
  code: string;
  name: string;
  type: string;
  isRefundable: boolean;
  receiptOrder: number | null;
  receiptLabel: string | null;
}

interface ReceiptRowsManagerProps {
  initialHeads: FeeHeadRow[];
  saveRowsAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}

function formatCategory(type: string) {
  if (type === "one_time") return "One-time";
  if (type === "recurring") return "Recurring";
  if (type === "optional") return "Optional";
  return type.replace("_", " ");
}

export function ReceiptRowsManager({ initialHeads, saveRowsAction }: ReceiptRowsManagerProps) {
  // Sort items: existing receiptOrder first, then any unassigned by name; assign 1..N order
  const getSortedInitial = (heads: FeeHeadRow[]) => {
    const active = heads
      .filter((h) => h.receiptOrder != null)
      .sort((a, b) => (a.receiptOrder ?? 0) - (b.receiptOrder ?? 0));
    const unassigned = heads
      .filter((h) => h.receiptOrder == null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...active, ...unassigned];
    return sorted.map((h, i) => ({ ...h, receiptOrder: i + 1 }));
  };

  const [items, setItems] = useState<FeeHeadRow[]>(() => getSortedInitial(initialHeads));

  // Move row up
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...items];
    const prev = next[index - 1]!;
    const curr = next[index]!;
    next[index - 1] = curr;
    next[index] = prev;
    setItems(next.map((h, i) => ({ ...h, receiptOrder: i + 1 })));
  };

  // Move row down
  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const next = [...items];
    const curr = next[index]!;
    const nextItem = next[index + 1]!;
    next[index] = nextItem;
    next[index + 1] = curr;
    setItems(next.map((h, i) => ({ ...h, receiptOrder: i + 1 })));
  };

  const handleReset = () => {
    setItems(getSortedInitial(initialHeads));
  };

  return (
    <ActionForm action={saveRowsAction} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="text-xs text-gray-500">
          Fee heads print in this row order on paper receipts and bills.
          Use <b>▲</b> and <b>▼</b> to change the order.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition px-2 py-1"
          >
            Reset
          </button>
          <Submit variant="primary" className="py-1 px-3 text-xs">
            Save receipt rows
          </Submit>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="data">
          <thead>
            <tr>
              <th className="w-16 text-center">Row #</th>
              <th className="w-24 text-center">Order</th>
              <th>Fee head</th>
              <th className="w-36">Category</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h, index) => (
              <tr key={h.id} className="transition-colors bg-white hover:bg-subtle/70">
                {/* Hidden inputs submitted with the form */}
                <input type="hidden" name="ids" value={h.id} />
                <input type="hidden" name={`show_${h.id}`} value="on" />
                <input type="hidden" name={`order_${h.id}`} value={h.receiptOrder ?? index + 1} />
                <input type="hidden" name={`label_${h.id}`} value={h.receiptLabel ?? ""} />

                {/* Row Badge */}
                <td className="text-center">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-accent-soft px-1.5 text-xs font-bold tabular-nums text-accent-ink border border-accent/20">
                    #{index + 1}
                  </span>
                </td>

                {/* Move Up / Down Buttons */}
                <td className="text-center">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      title="Move up"
                      aria-label={`Move ${h.name} up`}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(index)}
                      disabled={index >= items.length - 1}
                      title="Move down"
                      aria-label={`Move ${h.name} down`}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      ▼
                    </button>
                  </div>
                </td>

                {/* Fee Head Name (No fee code) */}
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-ink">
                      {h.name}
                    </span>
                    {h.isRefundable && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                        Refundable
                      </span>
                    )}
                  </div>
                </td>

                {/* Category */}
                <td>
                  <span className="inline-flex rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                    {formatCategory(h.type)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ActionForm>
  );
}
