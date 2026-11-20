import { revalidatePath } from "next/cache";
import { fees, getSettings, receiptNumberPreview, setNextReceiptNumber, updateSchoolSettings } from "@sb/core";
import { setNextReceiptNumberSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { LogoCard } from "@/components/logo-card";
import { STANDARD_CLASSES, classOrder } from "@/lib/classes";
import { removeLogoAction, uploadLogoAction } from "./logo-actions";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { ProfileSection } from "./profile-section";

async function saveSection(_: ActionState, fd: FormData, message: string): Promise<ActionState> {
  const u = await requireRole("settings");
  const r = await run(() => updateSchoolSettings(u, formObject(fd)), message);
  revalidatePath("/", "layout");
  return r;
}

async function saveIdentity(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  return saveSection(_, fd, "School identity saved");
}
async function saveContact(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  return saveSection(_, fd, "Contact and payment details saved");
}
async function saveBilling(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  return saveSection(_, fd, "Bill and receipt settings saved");
}
async function saveReminders(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  return saveSection(_, fd, "Reminder timing saved");
}
async function saveFeatures(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const raw = formObject(fd);
  raw.concessionsEnabled = fd.has("concessionsEnabled");
  raw.dayCloseEnabled = fd.has("dayCloseEnabled");
  const u = await requireRole("settings");
  const r = await run(() => updateSchoolSettings(u, raw), "Feature settings saved");
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
  const name = String(fd.get("name") ?? "");
  const r = await run(() => fees.createClass(u, name, classOrder(name)), "Class added");
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

const field = "field-stack";
const hint = "hint";

export default async function SettingsPage() {
  await requireRole("settings");
  const [s, m, num] = await Promise.all([getSettings(), fees.masters(), receiptNumberPreview()]);
  return (
    <div className="page-stack">
      <PageHeader title="School Settings" actions={<>
        <LinkButton href="/settings/users">Users</LinkButton>
        <LinkButton href="/settings/providers">SMS / WhatsApp / Email</LinkButton>
        <LinkButton href="/settings/health">Backups & health</LinkButton>
        <LinkButton href="/settings/promotion">Year-end promotion</LinkButton>
      </>} />

      <ProfileSection title="School identity" action={saveIdentity}>
        <label className={field}>School name <span className={hint}>(printed in capitals on bills and receipts)</span><input name="name" defaultValue={s.name} required /></label>
        <label className={field}>Line under the name <span className={hint}>(e.g. managing society)</span><input name="headerSubtitle" defaultValue={s.headerSubtitle} placeholder="(Managed by … Parishad)" /></label>
        <label className={field}>Address / location line<input name="address" defaultValue={s.address} placeholder="Village * Post * District" /></label>
        <label className={field}>U-DISE code<input name="udiseCode" defaultValue={s.udiseCode} inputMode="numeric" /></label>
        <label className={`${field} sm:col-span-2`}>Registration lines <span className={hint}>(one per line)</span>
          <textarea name="registrationNote" defaultValue={s.registrationNote} rows={2} /></label>
      </ProfileSection>

      <ProfileSection title="Contact & payment" action={saveContact}>
        <label className={field}>Phone<input name="phone" defaultValue={s.phone} /></label>
        <label className={field}>Email<input name="email" defaultValue={s.email} /><FieldError name="email" /></label>
        <label className={field}>UPI ID <span className={hint}>(for QR on bills)</span><input name="upiId" defaultValue={s.upiId ?? ""} placeholder="school@bank" /></label>
      </ProfileSection>

      <ProfileSection title="Bills & receipts" action={saveBilling}>
        <label className={field}>Bill prefix<input name="invoicePrefix" defaultValue={s.invoicePrefix} /></label>
        <label className={field}>Receipt prefix<input name="receiptPrefix" defaultValue={s.receiptPrefix} /><FieldError name="receiptPrefix" /></label>
        <label className={field}>Receipt numbering
          <select name="receiptNumbering" defaultValue={s.receiptIncludeYear ? "per_year" : "continuous"}>
            <option value="continuous">One running series ({s.receiptPrefix}/6434)</option>
            <option value="per_year">Restarts every academic year ({s.receiptPrefix}/2026-27/1)</option>
          </select></label>
        <label className={field}>Number digits <span className={hint}>(1 = no leading zeros)</span><input name="receiptDigits" type="number" min={1} max={10} defaultValue={s.receiptDigits} /><FieldError name="receiptDigits" /></label>
      </ProfileSection>

      <ProfileSection title="Reminder timing" action={saveReminders}>
        <label className={field}>Send messages from<input name="quietStart" defaultValue={s.quietStart} /><FieldError name="quietStart" /></label>
        <label className={field}>…until<input name="quietEnd" defaultValue={s.quietEnd} /><FieldError name="quietEnd" /></label>
        <label className={field}>Reminder days before due<input name="reminderDaysBefore" type="number" defaultValue={s.reminderDaysBefore} /></label>
        <label className={field}>Overdue reminders after (days)<input name="overdueSteps" defaultValue={s.overdueSteps.join(", ")} /></label>
      </ProfileSection>

      <ProfileSection title="Features & backup" action={saveFeatures}>
        <label className={`${field} sm:col-span-2`}>Backup folder <span className={hint}>(second disk recommended)</span><input name="backupPath" defaultValue={s.backupPath ?? ""} placeholder="D:\SchoolBackups" /></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="concessionsEnabled" defaultChecked={s.concessionsEnabled} className="mt-0.5" />
          <span>Fee concessions <span className={hint}>— sibling, staff ward or merit discounts applied to new bills.</span></span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="dayCloseEnabled" defaultChecked={s.dayCloseEnabled} className="mt-0.5" />
          <span>Cash counter closing <span className={hint}>— cashiers count the drawer and lock the day. Most schools leave this off.</span></span></label>
      </ProfileSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <LogoCard hasLogo={!!s.logoPath} version={s.logoPath ?? ""} upload={uploadLogoAction} remove={removeLogoAction} />

        <Card title="Receipt numbers">
          {num ? (<>
            <p className="text-sm">The next receipt will be numbered <b className="font-mono text-base">{num.text}</b>
              <span className="ml-2 text-gray-500">(series {num.series}, {num.issued} issued so far)</span></p>
            {num.canSetStart ? (
              <ActionForm action={setNextNumber} className="mt-3 flex flex-wrap items-end gap-2">
                <label className={field}>Continue the paper receipt book from number
                  <input name="next" type="number" min={1} defaultValue={num.next} className="w-44" /><FieldError name="next" /></label>
                <Submit variant="secondary">Set number</Submit>
              </ActionForm>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Numbers in this series are already in use, so they can&apos;t be changed. To continue from another number, change the receipt prefix above, save, and set the number here.</p>
            )}
            <p className="mt-2 text-xs text-gray-500">Do this before the first receipt is printed (if the paper book is at 6434, type 6435).</p>
          </>) : <p className="text-sm text-gray-500">Set a current academic year first.</p>}
        </Card>

        <Card title="Academic years">
          <ul className="space-y-1 text-sm">{m.years.map((y) => (
            <li key={y.id} className="flex justify-between"><span>{y.name} ({y.startDate} → {y.endDate})</span>
              {y.isCurrent ? <b className="text-ink">current</b> : <form action={makeCurrent.bind(null, y.id)}><button className="text-xs text-ink hover:underline">Make current</button></form>}</li>
          ))}</ul>
          <ActionForm action={addYear} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
            <input name="name" placeholder="2027-28" className="w-24" required /><input type="date" name="startDate" required /><input type="date" name="endDate" required />
            <Submit variant="secondary">Add</Submit><FieldError name="name" /><FieldError name="endDate" />
          </ActionForm>
        </Card>

        <Card title="Classes & sections">
          <div className="flex flex-wrap gap-2 text-sm">{m.classes.map((c) => (
            <span key={c.id} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs">{c.name}: {m.sections.filter((x) => x.classId === c.id).map((x) => x.name).join(", ") || "—"}</span>
          ))}</div>
          <ActionForm action={addClass} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
            <select name="name" required defaultValue="">
              <option value="" disabled>Choose class…</option>
              {STANDARD_CLASSES.filter((c) => !m.classes.some((x) => x.name.toLowerCase() === c.toLowerCase())).map((c) => <option key={c} value={c}>{c}</option>)}
            </select><Submit variant="secondary">Add class</Submit>
          </ActionForm>
          <ActionForm action={addSection} className="mt-2 flex flex-wrap gap-2" resetOnSuccess>
            <select name="classId">{m.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input name="name" placeholder="Section" className="w-20" required /><Submit variant="secondary">Add section</Submit>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
