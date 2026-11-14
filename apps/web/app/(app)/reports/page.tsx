import Link from "next/link";
import { addDays, formatDate, reports, today, getSettings } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { Card, LinkButton, Money, PageHeader, Stat } from "@/components/ui";

function Breakdown({ title, rows }: { title: string; rows: { key: string; v: number; n: number }[] }) {
  return (
    <Card title={title}>
      <table className="data"><tbody>
        {rows.length === 0 && <tr><td className="text-gray-500">No data</td></tr>}
        {rows.map((r) => <tr key={r.key}><td className="capitalize">{r.key.replace("_", " ")}</td><td className="num text-gray-500">{r.n}</td><td className="num"><Money p={r.v} /></td></tr>)}
      </tbody></table>
    </Card>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole("reports");
  const sp = await searchParams;
  const to = sp.to ?? today();
  const from = sp.from ?? `${to.slice(0, 7)}-01`;
  const [col, out, conc, late, cancelled] = await Promise.all([
    reports.collectionReport(from, to), reports.outstandingByClass(), reports.concessionReport(from, to), reports.lateFeeReport(from, to), reports.cancelledReceipts(from, to),
  ]);
  const q = `from=${from}&to=${to}`;
  const concessionsOn = (await getSettings()).concessionsEnabled;
  return (
    <div className="space-y-5">
      <PageHeader title="Reports" subtitle={`${formatDate(from)} – ${formatDate(to)}`} actions={<>
        <form className="flex gap-2"><input type="date" name="from" defaultValue={from} /><input type="date" name="to" defaultValue={to} /><button className="rounded-md border border-gray-300 bg-white px-3 text-sm">Apply</button></form>
        <LinkButton href={`/reports?from=${addDays(today(), -6)}&to=${today()}`}>Last 7 days</LinkButton>
        <LinkButton variant="primary" href="/reports/defaulters">Defaulters</LinkButton>
      </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Collected" value={<Money p={col.total} />} />
        <Stat label="Refunded" value={<Money p={col.refunded} />} />
        <Stat label="Late fee charged / collected" value={<><Money p={late.charged} /> / <Money p={late.collected} /></>} />
        <Stat label="Cancelled receipts" value={cancelled.length} tone={cancelled.length ? "red" : undefined} />
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/api/export/collections?${q}`}>Export receipts (Excel)</LinkButton>
        <LinkButton href={`/api/export/outstanding`}>Export outstanding (Excel)</LinkButton>
        <LinkButton href={`/api/export/tally?${q}`}>Tally vouchers (CSV)</LinkButton>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="By mode" rows={col.byMode} />
        <Breakdown title="By cashier" rows={col.byCashier} />
        <Breakdown title="By fee head" rows={col.byHead} />
        <Breakdown title="By class" rows={col.byClass} />
        <Breakdown title="By date" rows={col.byDate.map((d) => ({ ...d, key: formatDate(d.key) }))} />
        {concessionsOn && (
        <Card title="Concessions given">
          <table className="data"><tbody>{conc.length === 0 && <tr><td className="text-gray-500">None</td></tr>}{conc.map((c) => <tr key={c.head}><td>{c.head}</td><td className="num text-gray-500">{c.lines}</td><td className="num"><Money p={c.discount} /></td></tr>)}</tbody></table>
        </Card>
        )}
      </div>
      <Card title="Outstanding by class (all time)">
        <table className="data">
          <thead><tr><th>Class</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Balance</th><th className="num">Overdue</th></tr></thead>
          <tbody>{out.map((o) => <tr key={o.className}><td>{o.className}</td><td className="num"><Money p={o.billed} /></td><td className="num"><Money p={o.paid} /></td><td className="num"><Money p={o.balance} /></td><td className="num"><Money p={o.overdue} className={o.overdue ? "text-red-700" : ""} /></td></tr>)}</tbody>
        </table>
      </Card>
      {cancelled.length > 0 && (
        <Card title="Cancelled receipts">
          <table className="data"><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Cashier</th><th>Reason</th><th className="num">Amount</th></tr></thead>
            <tbody>{cancelled.map((c) => <tr key={c.p.id}><td><Link className="text-brand-700 hover:underline" href={`/receipts/${c.p.id}`}>{c.p.receiptNo}</Link></td><td>{formatDate(c.p.date)}</td><td>{c.studentName}</td><td>{c.cashier}</td><td className="wrap">{c.p.cancelReason}</td><td className="num"><Money p={c.p.amount} /></td></tr>)}</tbody></table>
        </Card>
      )}
    </div>
  );
}
