import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { billing, can, fees, formatDate, notifications, payments, periodLabel, students, today, getSettings } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear, nextYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Money, Notice, PageHeader } from "@/components/ui";
import { StudentPhoto } from "@/components/student-photo";
import { ReminderButtons } from "@/components/reminder-buttons";
import { removePhotoAction, uploadPhotoAction } from "./photo-actions";

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
async function promote(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("studentsEdit");
  const r = await run(() => students.promoteStudent(u, { ...formObject(fd), studentId: id }));
  if (!r?.ok) return r;
  const x = r.data as { yearName: string; carried: number };
  revalidatePath("/students");
  redirect(`/students/${id}?promoted=${encodeURIComponent(x.yearName)}&carried=${x.carried}`);
}

export default async function StudentProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; promoted?: string; carried?: string }> }) {
  const user = await requireRole("students");
  const id = Number((await params).id);
  const { created, saved, promoted, carried } = await searchParams;
  const p = await students.getStudentProfile(id);
  if (!p) notFound();
  const [ledger, conc, m, history, wy] = await Promise.all([students.studentLedger(id), fees.listConcessionTypes(), fees.masters(), students.listEnrollments(id), getWorkingYear()]);
  const concessionsOn = (await getSettings()).concessionsEnabled;
  const inYear = history.find((h) => h.e.academicYearId === wy.year.id);
  const latest = history.at(-1);
  const promoteYear = latest ? nextYear(m.years, latest.e.academicYearId) : undefined;
  const latestClass = m.classes.find((c) => c.id === latest?.e.classId);
  const nextClass = latestClass ? m.classes.filter((c) => c.sortOrder > latestClass.sortOrder).sort((a, b) => a.sortOrder - b.sortOrder)[0] : undefined;
  // Fee records grouped by academic year, newest year first.
  const yearIds = [...new Set([...history.map((h) => h.e.academicYearId), ...ledger.invoices.map((i) => i.academicYearId), ...ledger.payments.map((x) => x.academicYearId).filter((y): y is number => y != null)])];
  const byYear = m.years.filter((y) => yearIds.includes(y.id)).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((y) => {
    const bills = ledger.invoices.filter((i) => i.academicYearId === y.id).slice().reverse();
    const pays = ledger.payments.filter((x) => (x.academicYearId ?? -1) === y.id).slice().reverse();
    const live = bills.filter((i) => i.status !== "cancelled");
    return { y, bills, pays, enr: history.find((h) => h.e.academicYearId === y.id),
      billed: live.reduce((a, i) => a + i.net, 0), paid: pays.filter((x) => x.status === "valid").reduce((a, x) => a + x.amount, 0), balance: live.reduce((a, i) => a + i.balance, 0) };
  });
  const unassignedPays = ledger.payments.filter((x) => x.academicYearId == null);
  const outstanding = ledger.invoices.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.balance, 0);
  const edit = can(user.role, "studentsEdit");

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <StudentPhoto studentId={id} name={p.s.name} photoPath={p.s.photoPath} canEdit={edit} upload={uploadPhotoAction} remove={removePhotoAction} />
        <div className="w-full min-w-0 flex-1">
      <PageHeader title={p.s.name} subtitle={<>{p.s.admissionNo} · {inYear ? <>Class {inYear.className}{inYear.sectionName ? "-" + inYear.sectionName : ""}{inYear.e.rollNo ? ` · Roll ${inYear.e.rollNo}` : ""} in {wy.year.name}</> : <span className="text-amber-700">Not enrolled in {wy.year.name}{latest ? ` (last: ${latest.yearName}, Class ${latest.className})` : ""}</span>} · <Badge>{p.s.status}</Badge></>}
        actions={<>
          {can(user.role, "collect") && <LinkButton variant="primary" href={`/collect?student=${id}`}>Collect fee</LinkButton>}
          <LinkButton href={`/students/${id}/statement`}>Statement</LinkButton>
          {edit && <LinkButton href={`/students/${id}/edit`}>Edit</LinkButton>}
          {edit && <LinkButton href={`/students/new?sibling=${id}`}>Add sibling</LinkButton>}
        </>} />
        </div>
      </div>
      {created && <Notice tone="ok">Admission saved.</Notice>}
      {saved && <Notice tone="ok">Changes saved.</Notice>}
      {promoted && <Notice tone="ok">Promoted to <b>{promoted}</b>. The previous year&apos;s record, bills and payments are kept below as history.{Number(carried) > 0 && <> Unpaid dues of <Money p={Number(carried)} /> were moved into {promoted} as an opening-balance bill.</>}</Notice>}

      <div className={`grid gap-4 ${concessionsOn ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <Card title="Balance">
          <div className="text-3xl font-semibold"><Money p={outstanding} className={outstanding ? "text-red-700" : "text-green-700"} /></div>
          <div className="mt-1 text-sm text-gray-500">Advance (wallet): <Money p={ledger.wallet} /></div>
          {can(user.role, "notifications") && outstanding > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Send fee reminder to parent</div>
              <ReminderButtons studentIds={[id]} availability={notifications.channelAvailability(p.guardians.find((x) => x.isPrimary)?.g ?? p.guardians[0]?.g)} />
            </div>
          )}
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
        {concessionsOn && (
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
        )}
      </div>

      <Card title="Academic history">
        <table className="data">
          <thead><tr><th>Academic year</th><th>Class</th><th>Section</th><th>Roll</th><th>Status</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Balance</th><th /></tr></thead>
          <tbody>
            {history.length === 0 && <tr><td colSpan={9} className="text-gray-500">No academic year records.</td></tr>}
            {history.slice().reverse().map((h) => {
              const t = byYear.find((x) => x.y.id === h.e.academicYearId);
              return (
                <tr key={h.e.id} className={h.e.academicYearId === wy.year.id ? "bg-brand-50/50" : ""}>
                  <td className="font-medium">{h.yearName}{h.isCurrent ? <span className="ml-1 text-xs text-green-700">(current)</span> : null}</td>
                  <td>{h.className}</td><td>{h.sectionName ?? "—"}</td><td>{h.e.rollNo ?? "—"}</td><td><Badge>{h.e.status.replace("_", " ")}</Badge></td>
                  <td className="num"><Money p={t?.billed ?? 0} /></td><td className="num"><Money p={t?.paid ?? 0} /></td><td className="num"><Money p={t?.balance ?? 0} className={t?.balance ? "text-red-700" : ""} /></td>
                  <td>{edit && <Link className="text-xs text-brand-700 hover:underline" href={`/students/${id}/edit?year=${h.e.academicYearId}`}>Edit</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {edit && p.s.status !== "alumni" && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">Promote to the next academic year</h3>
            {!promoteYear ? (
              <p className="text-sm text-gray-500">There is no academic year after {latest?.yearName ?? "the current one"} yet. Add it under <Link className="text-brand-700 underline" href="/settings">Settings → Academic years</Link>.</p>
            ) : (
              <ActionForm action={promote.bind(null, id)} className="grid gap-3 sm:grid-cols-5">
                <label className="flex flex-col gap-1">Into year<select name="toYearId" defaultValue={promoteYear.id}>{m.years.filter((y) => !history.some((h) => h.e.academicYearId === y.id)).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
                <label className="flex flex-col gap-1">Class<select name="classId" defaultValue={nextClass?.id ?? latest?.e.classId}>{m.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="flex flex-col gap-1">Section<select name="sectionId" defaultValue=""><option value="">—</option>{m.sections.map((x) => <option key={x.id} value={x.id}>{m.classes.find((c) => c.id === x.classId)?.name}-{x.name}</option>)}</select></label>
                <label className="flex flex-col gap-1">Roll no.<input name="rollNo" defaultValue={latest?.e.rollNo ?? ""} /></label>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" name="carryDues" defaultChecked />Carry unpaid dues</label>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-5">
                  <Submit confirm="Promote this student? Their current-year record stays as history.">Promote</Submit>
                  <span className="text-xs text-gray-500">Personal and parent details carry over. To change them, use <Link className="underline" href={`/students/${id}/edit`}>Edit</Link> after promoting.</span>
                </div>
              </ActionForm>
            )}
          </div>
        )}
      </Card>

      {byYear.map(({ y, bills, pays, enr, billed, paid, balance }) => (
        <Card key={y.id} title={<>Fee records · {y.name}{enr ? ` · Class ${enr.className}${enr.sectionName ? "-" + enr.sectionName : ""}` : ""}</>}
          actions={<span className="text-xs text-gray-600">Billed <Money p={billed} /> · Paid <Money p={paid} /> · Balance <Money p={balance} className={balance ? "font-semibold text-red-700" : ""} /></span>}>
          <div className="grid gap-4 2xl:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Bills</h3>
              {bills.length === 0 ? <p className="text-sm text-gray-500">No bills in {y.name}.</p> : (
                <div className="overflow-x-auto"><table className="data">
                  <thead><tr><th>Bill no.</th><th>Period</th><th>Due</th><th>Status</th><th className="num">Net</th><th className="num">Balance</th><th /></tr></thead>
                  <tbody>{bills.map((i) => (
                    <tr key={i.id}>
                      <td><Link className="text-brand-700 hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></td>
                      <td>{periodLabel(i.period)}</td><td>{formatDate(i.dueDate)}</td><td><Badge>{i.status}</Badge></td>
                      <td className="num"><Money p={i.net} /></td><td className="num"><Money p={i.balance} /></td>
                      <td><a className="text-xs text-brand-700 hover:underline" target="_blank" href={`/invoices/${i.id}/print?auto=1`}>Print</a></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Payments</h3>
              {pays.length === 0 ? <p className="text-sm text-gray-500">No payments in {y.name}.</p> : (
                <div className="overflow-x-auto"><table className="data">
                  <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>{pays.map((x) => (
                    <tr key={x.id}><td><Link className="text-brand-700 hover:underline" href={`/receipts/${x.id}`}>{x.receiptNo}</Link></td><td>{formatDate(x.date)}</td>
                      <td className="capitalize">{x.mode.replace("_", " ")}</td><td className="num"><Money p={x.amount} /></td><td><Badge>{x.status}</Badge></td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          </div>
        </Card>
      ))}
      {unassignedPays.length > 0 && <Notice tone="warn">{unassignedPays.length} payment(s) fall outside every academic year&apos;s dates. Check Settings → Academic years.</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
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
