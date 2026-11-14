import Link from "next/link";
import { revalidatePath } from "next/cache";
import { can, fees, formatDate, notifications, reports } from "@sb/core";
import { rupeesToPaise } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, LinkButton, Money, PageHeader } from "@/components/ui";
import { ReminderButtons } from "@/components/reminder-buttons";
import { wakeDispatcher } from "@/lib/boss";

async function remind(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("notifications");
  const ids = fd.getAll("studentIds").map(Number);
  const r = await run(() => notifications.sendReminderNow(u, ids), (n) => `${n} message(s) sending now.`);
  if (r?.ok) await wakeDispatcher();
  revalidatePath("/notifications");
  return r;
}

export default async function Defaulters({ searchParams }: { searchParams: Promise<{ classId?: string; min?: string; days?: string }> }) {
  const user = await requireRole("reports");
  const sp = await searchParams;
  const { classes } = await fees.masters();
  const minAmount = sp.min ? rupeesToPaise.safeParse(sp.min).data ?? 0 : 0;
  const rows = await reports.defaulters({ classId: sp.classId ? Number(sp.classId) : undefined, minAmount, minDaysOverdue: sp.days ? Number(sp.days) : 1 });
  const total = rows.reduce((a, r) => a + r.due, 0);
  const reach = can(user.role, "notifications") ? await notifications.availabilityForStudents(rows.map((r) => r.studentId)) : new Map();
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const canSend = can(user.role, "notifications");
  return (
    <div>
      <PageHeader title="Defaulters" subtitle={<>{rows.length} students · <Money p={total} /> overdue</>} actions={<>
        <LinkButton href={`/api/export/defaulters?${qs}`}>Export Excel</LinkButton>
        <LinkButton href={`/reports/defaulters/print?${qs}`} target="_blank">Print</LinkButton>
      </>} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <select name="classId" defaultValue={sp.classId}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input name="min" defaultValue={sp.min} placeholder="Min amount ₹" className="w-32" />
          <input name="days" type="number" defaultValue={sp.days} placeholder="Min days overdue" className="w-40" />
          <button className="rounded-md border border-gray-300 bg-white px-3 text-sm">Filter</button>
        </form>
        {rows.length === 0 ? <Empty>No defaulters for this filter.</Empty> : (
          <ActionForm action={remind}>
            <table className="data">
              <thead><tr>{canSend && <th />}<th>Adm. no.</th><th>Student</th><th>Class</th><th>Guardian</th><th>Oldest due</th><th className="num">Days</th><th className="num">Bills</th><th className="num">Amount</th>{canSend && <th>Remind</th>}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.studentId}>
                  {canSend && <td><input type="checkbox" name="studentIds" value={r.studentId} defaultChecked /></td>}
                  <td>{r.admissionNo}</td><td><Link className="text-brand-700 hover:underline" href={`/students/${r.studentId}`}>{r.name}</Link></td><td>{r.className}</td>
                  <td className="text-xs">{r.guardian}</td><td>{formatDate(r.oldestDue)}</td><td className="num">{r.daysOverdue}</td><td className="num">{r.invoices}</td><td className="num"><Money p={r.due} /></td>
                  {canSend && <td><ReminderButtons compact studentIds={[r.studentId]} availability={reach.get(r.studentId)} /></td>}
                </tr>
              ))}</tbody>
            </table>
            {canSend && <div className="mt-3"><Submit confirm="Send a reminder on all channels to the selected parents now?">Send reminder to selected (all channels)</Submit></div>}
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
