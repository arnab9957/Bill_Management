import Link from "next/link";
import { billing, can, fees, formatDate, notifications, periodLabel } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { Badge, Card, Empty, LinkButton, Money, PageHeader } from "@/components/ui";
import { ReminderButtons } from "@/components/reminder-buttons";

export default async function Invoices({ searchParams }: { searchParams: Promise<{ q?: string; period?: string; classId?: string; status?: string }> }) {
  const user = await requireRole("billing");
  const sp = await searchParams;
  const { classes } = await fees.masters();
  const rows = await billing.listInvoices({ q: sp.q, period: sp.period, classId: sp.classId ? Number(sp.classId) : undefined, status: sp.status });
  const total = rows.reduce((a, r) => a + r.inv.balance, 0);
  const canSend = can(user.role, "notifications");
  const unpaid = rows.filter((r) => r.inv.balance > 0 && r.inv.status !== "cancelled").map((r) => r.inv.studentId);
  const reach = canSend ? await notifications.availabilityForStudents([...new Set(unpaid)]) : new Map();
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div>
      <PageHeader title="Bills" subtitle={<>{rows.length} shown · balance <Money p={total} /></>} actions={<>
        {rows.length > 0 && <LinkButton href={`/invoices/print-all?${qs}`} target="_blank">🖨 Print all shown ({rows.length})</LinkButton>}
        <LinkButton variant="primary" href="/billing">Run billing</LinkButton>
      </>} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q} placeholder="Bill no., student, adm. no." />
          <input name="period" type="month" defaultValue={sp.period} />
          <select name="classId" defaultValue={sp.classId}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="status" defaultValue={sp.status}><option value="">Any status</option>{["issued", "partial", "overdue", "paid", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select>
          <button className="rounded-md border border-gray-300 bg-white px-3 text-sm">Filter</button>
        </form>
        {rows.length === 0 ? <Empty>No bills.</Empty> : (
          <table className="data">
            <thead><tr><th>Bill no.</th><th>Student</th><th>Class</th><th>Period</th><th>Due</th><th>Status</th><th className="num">Net</th><th className="num">Balance</th><th />{canSend && <th>Remind</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.inv.id}>
                  <td><Link className="text-brand-700 hover:underline" href={`/invoices/${r.inv.id}`}>{r.inv.invoiceNo}</Link></td>
                  <td><Link className="hover:underline" href={`/students/${r.inv.studentId}`}>{r.studentName}</Link> <span className="text-xs text-gray-500">{r.admissionNo}</span></td>
                  <td>{r.className}</td><td>{periodLabel(r.inv.period)}</td><td>{formatDate(r.inv.dueDate)}</td><td><Badge>{r.inv.status}</Badge></td>
                  <td className="num"><Money p={r.inv.net} /></td><td className="num"><Money p={r.inv.balance} /></td>
                  <td><a className="rounded border border-gray-300 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50" target="_blank" href={`/invoices/${r.inv.id}/print?auto=1`}>Print</a></td>
                  {canSend && <td>{r.inv.balance > 0 && r.inv.status !== "cancelled" && <ReminderButtons compact studentIds={[r.inv.studentId]} availability={reach.get(r.inv.studentId)} />}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
