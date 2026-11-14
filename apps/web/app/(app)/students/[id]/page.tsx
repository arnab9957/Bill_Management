import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { billing, can, fees, formatDate, notifications, payments, periodLabel, students, today } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Money, Notice, PageHeader } from "@/components/ui";

const path = (id: number) => `/students/${id}`;

async function setStatus(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("studentsEdit");
  const r = await run(() => students.setStudentStatus(u, id, fd.get("status") as "active", (fd.get("leavingDate") as string) || undefined), "Status updated");
  revalidatePath(path(id));
  return r;
}
async function grant(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.grantConcession(u, { ...formObject(fd), studentId: id }), "Concession approved — applies from the next bill");
  revalidatePath(path(id));
  return r;
}
async function revoke(id: number, concessionId: number) {
  "use server";
  const u = await requireRole("fees");
  await fees.revokeConcession(u, concessionId);
  revalidatePath(path(id));
}
async function misc(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("billing");
  const r = await run(() => billing.addMiscCharge(u, { ...formObject(fd), studentId: id }), (i) => `Charge added on bill ${i.invoiceNo}`);
  revalidatePath(path(id));
  return r;
}
async function doRefund(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("receiptsCancel");
  const r = await run(() => payments.refund(u, { ...formObject(fd), studentId: id }), "Refund recorded");
  revalidatePath(path(id));
  return r;
}
async function remind(id: number) {
  "use server";
  const u = await requireRole("notifications");
  await notifications.sendReminderNow(u, [id]);
  revalidatePath(path(id));
}

export default async function StudentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireRole("students");
  const id = Number((await params).id);
  const { created } = await searchParams;
  const p = await students.getStudentProfile(id);
  if (!p) notFound();
  const [ledger, conc, m] = await Promise.all([students.studentLedger(id), fees.listConcessionTypes(), fees.masters()]);
  const outstanding = ledger.invoices.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.balance, 0);
  const edit = can(user.role, "studentsEdit");

  return (
    <div className="space-y-5">
      <PageHeader title={p.s.name} subtitle={<>{p.s.admissionNo} · Class {p.className}{p.sectionName ? "-" + p.sectionName : ""} · <Badge>{p.s.status}</Badge></>}
        actions={<>
          {can(user.role, "collect") && <LinkButton variant="primary" href={`/collect?student=${id}`}>Collect fee</LinkButton>}
          <LinkButton href={`/students/${id}/statement`}>Statement</LinkButton>
          {edit && <LinkButton href={`/students/${id}/edit`}>Edit</LinkButton>}
          {edit && <LinkButton href={`/students/new?sibling=${id}`}>Add sibling</LinkButton>}
          {can(user.role, "notifications") && outstanding > 0 && <form action={remind.bind(null, id)}><button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm">Send reminder now</button></form>}
        </>} />
      {created && <Notice tone="ok">Admission saved.</Notice>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Balance">
          <div className="text-3xl font-semibold"><Money p={outstanding} className={outstanding ? "text-red-700" : "text-green-700"} /></div>
          <div className="mt-1 text-sm text-gray-500">Advance (wallet): <Money p={ledger.wallet} /></div>
          <div className="mt-3 text-sm text-gray-600">Admitted {formatDate(p.s.admissionDate)}{p.s.leavingDate ? ` · Left ${formatDate(p.s.leavingDate)}` : ""}{p.route ? ` · ${p.route}` : ""}</div>
        </Card>
        <Card title="Guardian">
          {p.guardians.map(({ g }) => (
            <div key={g.id} className="text-sm">
              <div className="font-medium">{g.name} <span className="text-gray-500">({g.relation})</span></div>
              <div>{g.mobile}{g.whatsappNo && g.whatsappNo !== g.mobile ? ` · WA ${g.whatsappNo}` : ""}</div>
              <div className="text-gray-600">{g.email}</div>
              <div className="mt-1 text-xs text-gray-500">
                Messages: {[g.notifySms && "SMS", g.notifyWhatsapp && "WhatsApp", g.notifyEmail && g.email && "Email"].filter(Boolean).join(", ") || "none"}
                {!g.messagingConsent && <span className="ml-1 text-red-600">· no consent recorded – no messages sent</span>}
              </div>
            </div>
          ))}
          {p.siblings.length > 0 && <div className="mt-3 text-sm">Siblings: {p.siblings.map((s) => <Link key={s.id} className="mr-2 text-brand-700 hover:underline" href={`/students/${s.id}`}>{s.name} ({s.className})</Link>)}</div>}
        </Card>
        <Card title="Concessions">
          <ul className="space-y-1 text-sm">
            {p.concessions.length === 0 && <li className="text-gray-500">None</li>}
            {p.concessions.map(({ c, t }) => (
              <li key={c.id} className={`flex items-center justify-between ${c.isActive ? "" : "text-gray-400 line-through"}`}>
                <span>{t.name} ({t.kind === "percent" ? `${t.value / 100}%` : <Money p={t.value} />}) from {formatDate(c.validFrom)}{c.validTo ? ` to ${formatDate(c.validTo)}` : ""}</span>
                {c.isActive && can(user.role, "fees") && <form action={revoke.bind(null, id, c.id)}><button className="text-xs text-red-600 hover:underline">Revoke</button></form>}
              </li>
            ))}
          </ul>
          {can(user.role, "fees") && (
            <ActionForm action={grant.bind(null, id)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
              <select name="concessionTypeId" required>{conc.map(({ t }) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <input type="date" name="validFrom" defaultValue={today()} required />
              <input type="date" name="validTo" title="Valid to (optional)" />
              <Submit variant="secondary">Approve</Submit>
            </ActionForm>
          )}
        </Card>
      </div>

      <Card title="Bills">
        <table className="data">
          <thead><tr><th>Bill no.</th><th>Period</th><th>Due</th><th>Status</th><th className="num">Net</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {ledger.invoices.slice().reverse().map((i) => (
              <tr key={i.id}>
                <td><Link className="text-brand-700 hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></td>
                <td>{periodLabel(i.period)}</td><td>{formatDate(i.dueDate)}</td><td><Badge>{i.status}</Badge></td>
                <td className="num"><Money p={i.net} /></td><td className="num"><Money p={i.paid} /></td><td className="num"><Money p={i.balance} /></td>
                <td><a className="text-xs text-brand-700 hover:underline" target="_blank" href={`/invoices/${i.id}/print`}>Print</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Receipts">
          <table className="data">
            <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {ledger.payments.slice().reverse().map((x) => (
                <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/receipts/${x.id}`}>{x.receiptNo}</Link></td><td>{formatDate(x.date)}</td>
                  <td className="capitalize">{x.mode.replace("_", " ")}</td><td className="num"><Money p={x.amount} /></td><td><Badge>{x.status}</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Messages sent">
          <table className="data">
            <thead><tr><th>When</th><th>Event</th><th>Channel</th><th>Status</th></tr></thead>
            <tbody>
              {p.messages.length === 0 && <tr><td colSpan={4} className="text-gray-500">No messages yet.</td></tr>}
              {p.messages.map((x) => (
                <tr key={x.id} title={x.body}><td className="whitespace-nowrap text-xs">{x.createdAt.toLocaleString("en-IN")}</td><td className="text-xs">{x.event.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="capitalize">{x.channel}</td><td className="wrap"><Badge>{x.status}</Badge>{x.lastError && <div className="text-xs text-gray-500">{x.lastError}</div>}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {can(user.role, "billing") && (
          <Card title="Add miscellaneous charge">
            <ActionForm action={misc.bind(null, id)} className="grid gap-2" resetOnSuccess>
              <select name="feeHeadId">{m.heads.filter((h) => !["LATE_FEE", "OPENING", "BOUNCE"].includes(h.code)).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
              <input name="description" placeholder="Description (e.g. Library fine)" required /><FieldError name="description" />
              <input name="amount" placeholder="Amount ₹" inputMode="decimal" required /><FieldError name="amount" />
              <input type="date" name="dueDate" defaultValue={today()} required />
              <Submit variant="secondary">Add charge</Submit>
            </ActionForm>
          </Card>
        )}
        {can(user.role, "receiptsCancel") && ledger.wallet > 0 && (
          <Card title="Refund advance">
            <ActionForm action={doRefund.bind(null, id)} className="grid gap-2">
              <input name="amount" placeholder="Amount ₹" inputMode="decimal" required /><FieldError name="amount" />
              <select name="mode"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select>
              <input name="reason" placeholder="Reason" required /><FieldError name="reason" />
              <Submit variant="secondary" confirm="Record this refund?">Record refund</Submit>
            </ActionForm>
          </Card>
        )}
        {edit && (
          <Card title="Status">
            <ActionForm action={setStatus.bind(null, id)} className="grid gap-2">
              <select name="status" defaultValue={p.s.status}><option value="active">Active</option><option value="left">Left school (stops billing)</option><option value="alumni">Alumni</option></select>
              <input type="date" name="leavingDate" defaultValue={p.s.leavingDate ?? today()} />
              {outstanding > 0 && <p className="text-xs text-amber-700">Dues of <Money p={outstanding} /> are pending — no-dues not possible yet.</p>}
              <Submit variant="secondary">Update status</Submit>
            </ActionForm>
            {outstanding === 0 && p.s.status !== "active" && <a className="mt-2 inline-block text-sm text-brand-700 hover:underline" target="_blank" href={`/students/${id}/no-dues`}>Print no-dues certificate</a>}
          </Card>
        )}
      </div>
    </div>
  );
}
