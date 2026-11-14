"use client";
import { useActionResult } from "@/components/action-form";

type Row = { row: number; data?: Record<string, unknown>; errors: Record<string, string> };

export function ImportPreview() {
  const s = useActionResult();
  const d = s?.ok ? (s.data as { rows: Row[] }) : null;
  if (!d) return null;
  const bad = d.rows.filter((r) => Object.keys(r.errors).length);
  const shown = bad.length ? bad : d.rows.slice(0, 50);
  return (
    <div className="mt-4 max-h-[28rem] overflow-auto">
      <p className="mb-2 text-sm">{bad.length ? "Rows with errors:" : `All rows valid. First ${shown.length} shown:`}</p>
      <table className="data">
        <thead><tr><th>Row</th><th>Adm. no.</th><th>Name</th><th>Class</th><th>Guardian</th><th>Mobile</th><th>Problems</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.row} className={Object.keys(r.errors).length ? "bg-red-50" : ""}>
              <td>{r.row}</td><td>{String(r.data?.admissionNo ?? "")}</td><td>{String(r.data?.name ?? "")}</td><td>{String(r.data?.className ?? "")}</td>
              <td>{String(r.data?.guardianName ?? "")}</td><td>{String(r.data?.guardianMobile ?? "")}</td>
              <td className="wrap text-xs text-red-700">{Object.entries(r.errors).map(([k, v]) => `${k}: ${v}`).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
