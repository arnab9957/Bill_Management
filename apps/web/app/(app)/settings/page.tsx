import { revalidatePath } from "next/cache";
import { fees, getSettings, receiptNumberPreview, setNextReceiptNumber, toRupeeString, updateSchoolSettings } from "@sb/core";
import { rupeesToPaise, setNextReceiptNumberSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, LinkButton, Money, PageHeader } from "@/components/ui";

async function saveSchool(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => updateSchoolSettings(u, formObject(fd)), "Settings saved");
  revalidatePath("/", "layout");
  return r;
}
async function setNextNumber(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const parsed = setNextReceiptNumberSchema.safeParse({ next: fd.get("next") });
  if (!parsed.success) return { ok: false, message: "Enter a whole number, 1 or more", errors: { next: "Invalid number" } };
  const r = await run(() => setNextReceiptNumber(u, parsed.data.next), (n) => `Done. The next receipt will be ${n}`);
  revalidatePath("/settings");
  return r ? { ok: r.ok, message: r.message, errors: r.errors } : r;
}
async function addYear(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => fees.createYear(u, formObject(fd)), "Academic year added");
  revalidatePath("/settings");
  return r;
}
async function makeCurrent(id: number) {
  "use server";
  const u = await requireRole("settings");
  await fees.setCurrentYear(u, id);
  revalidatePath("/settings");
}
async function addClass(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => fees.createClass(u, String(fd.get("name")), Number(fd.get("sortOrder") || 0)), "Class added");
  revalidatePath("/settings");
  return r;
}
async function addSection(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => fees.createSection(u, Number(fd.get("classId")), String(fd.get("name"))), "Section added");
  revalidatePath("/settings");
  return r;
}
async function saveRoute(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(async () => fees.saveRoute(u, {
    id: fd.get("id") ? Number(fd.get("id")) : undefined, name: String(fd.get("name")), stops: String(fd.get("stops") ?? ""),
    monthlyFee: rupeesToPaise.parse(fd.get("monthlyFee") || "0"), isActive: fd.get("isActive") === "on",
  }), "Route saved");
  revalidatePath("/settings");
  return r;
}

export default async function SettingsPage() {
  await requireRole("settings");
  const [s, m, num] = await Promise.all([getSettings(), fees.masters(), receiptNumberPreview()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" actions={<>
        <LinkButton href="/settings/users">Users</LinkButton>
        <LinkButton href="/settings/providers">SMS / WhatsApp / Email</LinkButton>
        <LinkButton href="/settings/health">Backups & health</LinkButton>
        <LinkButton href="/settings/promotion">Year-end promotion</LinkButton>
      </>} />
      <Card title="School profile">
        <ActionForm action={saveSchool} className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-2">School name <span className="text-xs text-gray-500">(printed in capitals on the black banner of bills and receipts)</span><input name="name" defaultValue={s.name} required /></label>
          <label className="flex flex-col gap-1">Phone<input name="phone" defaultValue={s.phone} /></label>
          <label className="flex flex-col gap-1 sm:col-span-3">Line under the name <span className="text-xs text-gray-500">(e.g. managing society)</span><input name="headerSubtitle" defaultValue={s.headerSubtitle} placeholder="(Managed by … Parishad)" /></label>
          <label className="flex flex-col gap-1">U-DISE code<input name="udiseCode" defaultValue={s.udiseCode} inputMode="numeric" /></label>
          <label className="flex flex-col gap-1 sm:col-span-2">Registration lines <span className="text-xs text-gray-500">(one per line: society registration, 12A …)</span>
            <textarea name="registrationNote" defaultValue={s.registrationNote} rows={2} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2">Address / location line <span className="text-xs text-gray-500">(printed last in the header, in bold)</span><input name="address" defaultValue={s.address} placeholder="Village * Post * District" /></label>
          <label className="flex flex-col gap-1">Email<input name="email" defaultValue={s.email} /><FieldError name="email" /></label>
          <label className="flex flex-col gap-1">UPI ID (for QR on bills)<input name="upiId" defaultValue={s.upiId ?? ""} placeholder="school@bank" /></label>
          <label className="flex flex-col gap-1">Bill prefix<input name="invoicePrefix" defaultValue={s.invoicePrefix} /></label>
          <label className="flex flex-col gap-1">Receipt prefix<input name="receiptPrefix" defaultValue={s.receiptPrefix} /><FieldError name="receiptPrefix" /></label>
          <label className="flex flex-col gap-1">Receipt numbering
            <select name="receiptNumbering" defaultValue={s.receiptIncludeYear ? "per_year" : "continuous"}>
              <option value="continuous">One running series ({s.receiptPrefix}/6434)</option>
              <option value="per_year">Restarts every academic year ({s.receiptPrefix}/2026-27/1)</option>
            </select></label>
          <label className="flex flex-col gap-1">Number digits <span className="text-xs text-gray-500">(1 = no leading zeros)</span><input name="receiptDigits" type="number" min={1} max={10} defaultValue={s.receiptDigits} /><FieldError name="receiptDigits" /></label>
          <label className="flex flex-col gap-1">Send messages from<input name="quietStart" defaultValue={s.quietStart} /><FieldError name="quietStart" /></label>
          <label className="flex flex-col gap-1">…until<input name="quietEnd" defaultValue={s.quietEnd} /><FieldError name="quietEnd" /></label>
          <label className="flex flex-col gap-1">Reminder days before due<input name="reminderDaysBefore" type="number" defaultValue={s.reminderDaysBefore} /></label>
          <label className="flex flex-col gap-1">Overdue reminders after (days)<input name="overdueSteps" defaultValue={s.overdueSteps.join(", ")} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2">Backup folder (second disk recommended)<input name="backupPath" defaultValue={s.backupPath ?? ""} placeholder="D:\SchoolBackups" /></label>
          <label className="flex items-start gap-2 sm:col-span-3"><input type="checkbox" name="concessionsEnabled" defaultChecked={s.concessionsEnabled} className="mt-0.5" />
            <span>Fee concessions <span className="text-gray-500">— discounts such as sibling, staff ward or merit, approved per student and applied automatically to new bills. Leave off if your school doesn&apos;t give concessions.</span></span></label>
          <label className="flex items-start gap-2 sm:col-span-3"><input type="checkbox" name="dayCloseEnabled" defaultChecked={s.dayCloseEnabled} className="mt-0.5" />
            <span>Cash counter closing <span className="text-gray-500">— each cashier counts the cash drawer by notes at the end of the day and the day is then locked for them. Most schools leave this off.</span></span></label>
          <div className="sm:col-span-3"><Submit>Save</Submit></div>
        </ActionForm>
      </Card>

      <Card title="Receipt numbers">
        {num ? (<>
          <p className="text-sm">The next receipt will be numbered <b className="font-mono text-base">{num.text}</b>
            <span className="ml-2 text-gray-500">(series {num.series}, {num.issued} issued so far)</span></p>
          {num.canSetStart ? (
            <ActionForm action={setNextNumber} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">Continue the paper receipt book from number
                <input name="next" type="number" min={1} defaultValue={num.next} className="w-44" /><FieldError name="next" /></label>
              <Submit variant="secondary">Set number</Submit>
            </ActionForm>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Numbers in this series are already in use, so they can&apos;t be changed. To continue from another number, change the receipt prefix above, save, and set the number here.</p>
          )}
          <p className="mt-2 text-xs text-gray-500">Do this before the first receipt is printed, so the app carries on from the last receipt of your paper book (for example, if the book is at 6434, type 6435).</p>
        </>) : <p className="text-sm text-gray-500">Set a current academic year first.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Academic years">
          <ul className="space-y-1 text-sm">{m.years.map((y) => (
            <li key={y.id} className="flex justify-between"><span>{y.name} ({y.startDate} → {y.endDate})</span>
              {y.isCurrent ? <b className="text-green-700">current</b> : <form action={makeCurrent.bind(null, y.id)}><button className="text-xs text-brand-700 hover:underline">Make current</button></form>}</li>
          ))}</ul>
          <ActionForm action={addYear} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
            <input name="name" placeholder="2027-28" className="w-24" required /><input type="date" name="startDate" required /><input type="date" name="endDate" required />
            <Submit variant="secondary">Add</Submit><FieldError name="name" /><FieldError name="endDate" />
          </ActionForm>
        </Card>
        <Card title="Classes & sections">
          <div className="flex flex-wrap gap-2 text-sm">{m.classes.map((c) => (
            <span key={c.id} className="rounded bg-gray-100 px-2 py-0.5">{c.name}: {m.sections.filter((x) => x.classId === c.id).map((x) => x.name).join(", ") || "—"}</span>
          ))}</div>
          <ActionForm action={addClass} className="mt-3 flex gap-2" resetOnSuccess>
            <input name="name" placeholder="New class" required /><input name="sortOrder" type="number" placeholder="Order" className="w-20" /><Submit variant="secondary">Add class</Submit>
          </ActionForm>
          <ActionForm action={addSection} className="mt-2 flex gap-2" resetOnSuccess>
            <select name="classId">{m.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input name="name" placeholder="Section" className="w-20" required /><Submit variant="secondary">Add section</Submit>
          </ActionForm>
        </Card>
        <Card title="Transport routes" className="lg:col-span-2">
          <table className="data"><thead><tr><th>Route</th><th>Stops</th><th className="num">Monthly fee</th><th>Active</th></tr></thead>
            <tbody>{m.routes.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.stops}</td><td className="num"><Money p={r.monthlyFee} /></td><td>{r.isActive ? "Yes" : "No"}</td></tr>)}</tbody></table>
          <ActionForm action={saveRoute} className="mt-3 flex flex-wrap gap-2">
            <select name="id"><option value="">New route</option>{m.routes.map((r) => <option key={r.id} value={r.id}>Edit: {r.name}</option>)}</select>
            <input name="name" placeholder="Route name" required /><input name="stops" placeholder="Stops" /><input name="monthlyFee" placeholder="Monthly ₹" className="w-28" defaultValue={m.routes[0] ? "" : toRupeeString(0)} />
            <label className="flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked />Active</label>
            <Submit variant="secondary">Save route</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-gray-500">A mid-year route change takes effect from the next bill (edit the student&apos;s route).</p>
        </Card>
      </div>
    </div>
  );
}
