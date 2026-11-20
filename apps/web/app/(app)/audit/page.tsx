import { reports } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";

const TABLES = ["payment", "invoice", "student", "guardian", "cheque", "refund", "fee_structure_item", "student_concession", "app_user", "school_settings", "day_close", "notification_template"];

export default async function Audit({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requireRole("audit");
  const { table } = await searchParams;
  const rows = await reports.auditTrail({ table, limit: 500 });
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only record of every change: who, when, before and after." actions={
        <form className="toolbar"><select name="table" defaultValue={table}><option value="">All records</option>{TABLES.map((t) => <option key={t}>{t}</option>)}</select><button className="filter-button">Filter</button></form>
      } />
      <Card>
        <table className="data">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Change</th></tr></thead>
          <tbody>{rows.map(({ a, username }) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap text-xs">{a.at.toLocaleString("en-IN")}</td>
              <td>{username ?? "system"}{a.ip ? <div className="text-xs text-gray-400">{a.ip}</div> : null}</td>
              <td>{a.action}</td><td className="text-xs">{a.tableName} #{a.recordId}</td>
              <td className="wrap max-w-xl">
                <details><summary className="cursor-pointer text-xs text-ink">details</summary>
                  {a.oldValues != null && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all bg-red-50 p-1 text-[10px]">{JSON.stringify(a.oldValues, null, 1)}</pre>}
                  {a.newValues != null && <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all bg-gray-50 p-1 text-[10px]">{JSON.stringify(a.newValues, null, 1)}</pre>}
                </details>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
