"use client";
import { useEffect, useRef } from "react";
import { buttonClass, cx } from "./ui";

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
      <button onClick={doPrint} className={buttonClass("primary", "sm")}>Print</button>
      {formats?.map((f) => (
        <a key={f.key} href={`?format=${f.key}`} className={cx(buttonClass("secondary", "sm"), current === f.key && "border-ink text-ink")}>{f.label}</a>
      ))}
      <button onClick={() => window.close()} className={buttonClass("secondary", "sm")}>Close</button>
    </div>
  );
}
