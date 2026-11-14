import Link from "next/link";
import { formatINR, ops, reports, periodLabel } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { Card, Notice, PageHeader, Stat, Money } from "@/components/ui";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireRole("dashboard");
  const { denied } = await searchParams;
  const [d, h] = await Promise.all([reports.dashboard(), ops.health()]);
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.v));
  const pct = d.mtdBilled ? Math.round((d.mtdCollected / d.mtdBilled) * 100) : 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${user.fullName}`} />
      {denied && <Notice tone="warn">You don't have access to that page.</Notice>}
      {"issues" in h && h.issues && h.issues.length > 0 && user.role === "ADMIN" && (
        <Notice tone="error">Integrity check found {h.issues.length} problem(s). <Link className="underline" href="/settings/health">View</Link></Notice>
      )}
      {"usbBackupOverdue" in h && h.usbBackupOverdue && user.role === "ADMIN" && (
        <Notice tone="warn">Weekly USB backup is overdue{h.usbDays != null ? ` (last ${h.usbDays} days ago)` : ""}. <Link className="underline" href="/settings/health">Backups</Link></Notice>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Today's collection" value={formatINR(d.todayCollection)} sub={`${d.todayReceipts} receipts`} tone="green" />
        <Stat label="This month collected" value={formatINR(d.mtdCollected)} sub={`${pct}% of ${formatINR(d.mtdBilled)} billed`} />
        <Stat label="Total outstanding" value={formatINR(d.outstanding)} sub={<>Overdue {formatINR(d.overdue)}</>} tone="red" />
        <Stat label="Messages" value={d.queuedMessages} sub={<Link href="/notifications?status=failed" className={d.failedMessages ? "text-red-600 underline" : ""}>{d.failedMessages} failed</Link>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Collections – last 6 months">
          {d.trend.length === 0 ? <p className="text-sm text-gray-500">No collections yet.</p> : (
            <div className="flex h-44 items-end gap-3">
              {d.trend.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[10px] tabular-nums text-gray-500">{formatINR(t.v, { symbol: false }).replace(/\.\d+$/, "")}</div>
                  <div className="w-full rounded-t bg-brand-600" style={{ height: `${Math.max(4, (t.v / maxTrend) * 130)}px` }} />
                  <div className="text-xs text-gray-600">{periodLabel(t.month)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Top overdue classes" actions={<Link href="/reports/defaulters" className="text-xs text-brand-700 hover:underline">Defaulters →</Link>}>
          {d.topClasses.length === 0 ? <p className="text-sm text-gray-500">No overdue dues. 🎉</p> : (
            <table className="data"><thead><tr><th>Class</th><th className="num">Students</th><th className="num">Overdue</th></tr></thead>
              <tbody>{d.topClasses.map((c) => <tr key={c.className}><td>{c.className}</td><td className="num">{c.students}</td><td className="num"><Money p={c.v} /></td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Today by payment mode">
          {d.byMode.length === 0 ? <p className="text-sm text-gray-500">Nothing collected today.</p> : (
            <table className="data"><tbody>{d.byMode.map((m) => <tr key={m.mode}><td className="capitalize">{m.mode.replace("_", " ")}</td><td className="num"><Money p={m.v} /></td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
    </div>
  );
}
