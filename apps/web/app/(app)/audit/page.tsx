import { reports } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { AuditChange, RECORD_NAMES, actionName, auditSummary } from "@/components/audit-change";

const TABLES = ["payment", "invoice", "student", "guardian", "cheque", "refund", "fee_structure_item", "student_concession", "student_enrollment", "class_session", "academic_year", "app_user", "school_settings", "day_close", "notification_template"];

export default async function Audit({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requireRole("audit");
  const { table } = await searchParams;
  const rows = await reports.auditTrail({ table, limit: 500 });
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change, who made it and when. Nothing here can be edited or deleted." actions={
        <form className="toolbar"><select name="table" defaultValue={table}><option value="">All records</option>{TABLES.map((t) => <option key={t} value={t}>{RECORD_NAMES[t] ?? t}</option>)}</select><button className="filter-button">Filter</button></form>
      } />
      <Card>
        <table className="data">
          <thead><tr><th>When</th><th>By</th><th>What happened</th><th /></tr></thead>
          <tbody>{rows.map(({ a, username }) => (
            <tr key={a.id} className="align-top">
              <td className="whitespace-nowrap text-xs">{a.at.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{username ?? <span className="text-gray-500">Automatic</span>}{a.ip ? <div className="text-xs text-gray-400">{a.ip}</div> : null}</td>
              <td className="wrap max-w-2xl">
                <div className="text-sm">{auditSummary(a.tableName, a.action, a.oldValues, a.newValues)}</div>
                <div className="text-[11px] text-gray-400">{actionName(a.action)} · {RECORD_NAMES[a.tableName] ?? a.tableName}{a.recordId ? ` #${a.recordId}` : ""}</div>
              </td>
              <td className="wrap w-md max-w-md">
                <details><summary className="cursor-pointer text-xs text-ink">Details</summary>
                  <AuditChange oldV={a.oldValues} newV={a.newValues} />
                </details>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
