"use client";
import { useActionResult } from "@/components/action-form";
import { formatINR, formatDate } from "@sb/core/src/money-dates-client";

type R = {
  dryRun: boolean; yearName: string; totalNet: number;
  planned: { studentId: number; admissionNo: string; name: string; className: string; dueDate: string; net: number; lines: { description: string; net: number }[] }[];
  skipped: { studentId: number; name: string; reason: string }[];
  created: { invoiceId: number; invoiceNo: string }[];
};

export function RunResult() {
  const s = useActionResult();
  if (!s?.ok) return null;
  const r = s.data as R;
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-md bg-gray-50 p-3">{r.dryRun ? "Would create" : "Created"}: <b>{r.dryRun ? r.planned.length : r.created.length}</b> bills</div>
        <div className="rounded-md bg-gray-50 p-3">Total amount: <b>{formatINR(r.totalNet)}</b></div>
        <div className="rounded-md bg-gray-50 p-3">Skipped: <b>{r.skipped.length}</b></div>
      </div>
      {r.planned.length > 0 && (
        <div className="max-h-96 overflow-auto">
          <table className="data">
            <thead><tr><th>Adm. no.</th><th>Student</th><th>Class</th><th>Heads</th><th>Due</th><th className="num">Net</th></tr></thead>
            <tbody>{r.planned.map((p) => (
              <tr key={p.studentId}><td>{p.admissionNo}</td><td>{p.name}</td><td>{p.className}</td>
                <td className="text-xs">{p.lines.map((l) => l.description.replace(/ – .*$/, "")).join(", ")}</td>
                <td>{formatDate(p.dueDate)}</td><td className="num">{formatINR(p.net)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {r.skipped.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer">Skipped students ({r.skipped.length})</summary>
          <ul className="mt-2 list-disc pl-6">{r.skipped.map((x) => <li key={x.studentId}>{x.name}: {x.reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
