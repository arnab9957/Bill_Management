"use client";
import { useEffect, useRef } from "react";

/** Records the print (for DUPLICATE marking) and opens the print dialog once. */
export function PrintControls({ onPrint, auto, formats, current }: {
  onPrint?: () => Promise<void>; auto?: boolean; formats?: { key: string; label: string }[]; current?: string;
}) {
  const done = useRef(false);
  async function doPrint() {
    if (onPrint) await onPrint();
    window.print();
  }
  useEffect(() => {
    if (auto && !done.current) { done.current = true; void doPrint(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <div className="no-print mb-4 flex flex-wrap items-center gap-2">
      <button onClick={doPrint} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">Print</button>
      {formats?.map((f) => (
        <a key={f.key} href={`?format=${f.key}`} className={`rounded-md border px-3 py-1.5 text-sm ${current === f.key ? "border-brand-600 text-brand-700" : "border-gray-300"}`}>{f.label}</a>
      ))}
      <button onClick={() => window.close()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">Close</button>
    </div>
  );
}
