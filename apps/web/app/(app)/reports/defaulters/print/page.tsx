import { formatDate, formatINR, getSettings, reports, today } from "@sb/core";
import { rupeesToPaise } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";

export default async function DefaultersPrint({ searchParams }: { searchParams: Promise<{ classId?: string; min?: string; days?: string }> }) {
  await requireRole("reports");
  const sp = await searchParams;
  const rows = await reports.defaulters({ classId: sp.classId ? Number(sp.classId) : undefined, minAmount: sp.min ? rupeesToPaise.safeParse(sp.min).data ?? 0 : 0, minDaysOverdue: sp.days ? Number(sp.days) : 1 });
  const s = await getSettings();
  return (
    <div>
      <PrintControls />
      <div className="print-area bg-white p-4">
        <h1 className="text-center text-lg font-bold">{s.name}</h1>
        <h2 className="mb-3 text-center text-sm">Defaulters list as on {formatDate(today())}</h2>
        <table className="data">
          <thead><tr><th>#</th><th>Adm. no.</th><th>Student</th><th>Class</th><th>Guardian</th><th>Oldest due</th><th className="num">Amount</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.studentId}><td>{i + 1}</td><td>{r.admissionNo}</td><td>{r.name}</td><td>{r.className}</td><td>{r.guardian}</td><td>{formatDate(r.oldestDue)}</td><td className="num">{formatINR(r.due)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={6} className="font-semibold">Total</td><td className="num font-semibold">{formatINR(rows.reduce((a, r) => a + r.due, 0))}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
