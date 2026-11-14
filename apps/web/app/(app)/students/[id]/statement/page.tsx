import { notFound } from "next/navigation";
import { formatDate, formatINR, getSettings, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("students");
  const id = Number((await params).id);
  const [p, l, s] = await Promise.all([students.getStudentProfile(id), students.studentLedger(id), getSettings()]);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PrintControls />
      <div className="print-area rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-center">
          <div className="text-lg font-bold">{s.name}</div>
          <div className="text-xs text-gray-600">{s.address}</div>
          <div className="mt-2 font-semibold">Fee statement</div>
        </div>
        <div className="mt-3 text-sm">{p.s.name} · {p.s.admissionNo} · Class {p.className}{p.sectionName ? "-" + p.sectionName : ""} · as on {formatDate(new Date().toISOString().slice(0, 10))}</div>
        <table className="data mt-3">
          <thead><tr><th>Date</th><th>Ref</th><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {l.entries.map((e, i) => (
              <tr key={i}><td className="whitespace-nowrap">{formatDate(e.date)}</td><td className="text-xs">{e.ref}</td><td>{e.description}</td>
                <td className="num">{e.debit ? formatINR(e.debit, { symbol: false }) : ""}</td><td className="num">{e.credit ? formatINR(e.credit, { symbol: false }) : ""}</td>
                <td className="num">{formatINR(e.balance, { symbol: false })}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-sm">Closing balance: <b>{formatINR(l.entries.at(-1)?.balance ?? 0)}</b>{l.entries.at(-1) && l.entries.at(-1)!.balance < 0 ? " (advance)" : ""}</p>
      </div>
    </div>
  );
}
