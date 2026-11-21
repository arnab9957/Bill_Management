import { revalidatePath } from "next/cache";
import { getSettings, receiptNumberPreview, removeSchoolLogo, setNextReceiptNumber, setSchoolLogo, updateSchoolSettings } from "@sb/core";
import { setNextReceiptNumberSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { LinkButton } from "@/components/ui";
import { CollapsibleSection, SectionCollapseProvider } from "../../settings/section-collapse";
import { ProfileSection } from "../../settings/profile-section";
import { SchoolLogoField } from "../../settings/school-logo-field";

async function saveSection(_: ActionState, fd: FormData, message: string): Promise<ActionState> {
  const u = await requireRole("settings");
  const r = await run(() => updateSchoolSettings(u, formObject(fd)), message);
  revalidatePath("/", "layout");
  return r;
}

async function saveIdentity(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const logoFile = fd.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > 1024 * 1024) {
      return { ok: false, message: "The logo is larger than 1 MB. Use a smaller picture." };
    }
    const buf = new Uint8Array(await logoFile.arrayBuffer());
    try {
      await setSchoolLogo(u, buf);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save logo";
      return { ok: false, message: msg };
    }
  } else if (fd.get("removeLogo") === "true") {
    await removeSchoolLogo(u);
  }
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
  revalidatePath("/invoices/settings");
  revalidatePath("/settings");
  return r ? { ok: r.ok, message: r.message, errors: r.errors } : r;
}

const field = "field-stack";
const hint = "hint";

export default async function BillsSettingsPage() {
  await requireRole("settings");
  const [s, num] = await Promise.all([getSettings(), receiptNumberPreview()]);
  return (
    <div className="page-stack">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="border-b border-gray-200/70 bg-tint/70 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-highlight-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">Billing</div>
              <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">Bills Settings</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">School identity, payment details, bill and receipt defaults, features, backup, reminder timing and receipt numbering.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-teal/20 bg-teal/5 px-3 py-1.5 text-xs font-medium text-teal">Bills workspace</span>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">6 sections</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/invoices">Back to Bills</LinkButton>
              <LinkButton href="/settings">School Settings</LinkButton>
            </div>
          </div>
        </div>
      </div>

      <SectionCollapseProvider>
        <ProfileSection id="school-identity" title="School Identity" subtitle="Name, address, logo and registration lines printed on receipts." action={saveIdentity} saveLabel="Save school identity">
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              School name <span className="text-xs font-normal text-gray-500">(printed in capitals on bills and receipts)</span>
            </span>
            <input name="name" defaultValue={s.name} required />
          </label>
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              Line under the name <span className="text-xs font-normal text-gray-500">(e.g. managing society)</span>
            </span>
            <input name="headerSubtitle" defaultValue={s.headerSubtitle} placeholder="(Managed by … Parishad)" />
          </label>
          <label className={field}>Address / location line<input name="address" defaultValue={s.address} placeholder="Village * Post * District" /></label>
          <label className={field}>U-DISE code<input name="udiseCode" defaultValue={s.udiseCode} inputMode="numeric" /></label>
          <label className={`${field} sm:col-span-2`}>
            <span className="flex items-baseline gap-1.5">
              Registration lines <span className="text-xs font-normal text-gray-500">(one per line)</span>
            </span>
            <textarea name="registrationNote" defaultValue={s.registrationNote} rows={2} />
          </label>
          <SchoolLogoField hasLogo={!!s.logoPath} version={s.logoPath ?? ""} />
        </ProfileSection>

        <ProfileSection id="features-backup" title="Features & backup" subtitle="Optional modules and the backup location." action={saveFeatures} saveLabel="Save features & backup">
          <label className={`${field} sm:col-span-2`}>
            <span className="flex items-baseline gap-1.5">
              Backup folder <span className="text-xs font-normal text-gray-500">(second disk recommended)</span>
            </span>
            <input name="backupPath" defaultValue={s.backupPath ?? ""} placeholder="D:\SchoolBackups" />
          </label>
          <label className="flex items-start gap-2"><input type="checkbox" name="concessionsEnabled" defaultChecked={s.concessionsEnabled} className="mt-0.5" />
            <span>Fee concessions <span className={hint}>— sibling, staff ward or merit discounts applied to new bills.</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="dayCloseEnabled" defaultChecked={s.dayCloseEnabled} className="mt-0.5" />
            <span>Cash counter closing <span className={hint}>— cashiers count the drawer and lock the day. Most schools leave this off.</span></span></label>
        </ProfileSection>

        <ProfileSection id="contact-payment" title="Contact & Payment" subtitle="Phone, email and UPI details shown on bills." action={saveContact} saveLabel="Save contact & payment">
          <label className={field}>Phone<input name="phone" defaultValue={s.phone} /></label>
          <label className={field}>Email<input name="email" defaultValue={s.email} /><FieldError name="email" /></label>
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              UPI ID <span className="text-xs font-normal text-gray-500">(for QR on bills)</span>
            </span>
            <input name="upiId" defaultValue={s.upiId ?? ""} placeholder="school@bank" />
          </label>
        </ProfileSection>

        <ProfileSection id="bills-receipts" title="Bills & Receipts" subtitle="Prefixes, numbering and receipt format defaults." action={saveBilling} saveLabel="Save bills & receipts">
          <label className={field}>Bill prefix<input name="invoicePrefix" defaultValue={s.invoicePrefix} /></label>
          <label className={field}>Receipt prefix<input name="receiptPrefix" defaultValue={s.receiptPrefix} /><FieldError name="receiptPrefix" /></label>
          <label className={field}>Receipt numbering
            <select name="receiptNumbering" defaultValue={s.receiptIncludeYear ? "per_year" : "continuous"}>
              <option value="continuous">One running series ({s.receiptPrefix}/6434)</option>
              <option value="per_year">Restarts every academic year ({s.receiptPrefix}/2026-27/1)</option>
            </select></label>
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              Number digits <span className="text-xs font-normal text-gray-500">(1 = no leading zeros)</span>
            </span>
            <input name="receiptDigits" type="number" min={1} max={10} defaultValue={s.receiptDigits} />
            <FieldError name="receiptDigits" />
          </label>
        </ProfileSection>

        <ProfileSection id="reminder-timing" title="Reminder timing" subtitle="Quiet hours and the overdue reminder schedule." action={saveReminders} saveLabel="Save reminder timing">
          <label className={field}>Send messages from<input name="quietStart" defaultValue={s.quietStart} /><FieldError name="quietStart" /></label>
          <label className={field}>…until<input name="quietEnd" defaultValue={s.quietEnd} /><FieldError name="quietEnd" /></label>
          <label className={field}>Reminder days before due<input name="reminderDaysBefore" type="number" defaultValue={s.reminderDaysBefore} /></label>
          <label className={field}>Overdue reminders after (days)<input name="overdueSteps" defaultValue={s.overdueSteps.join(", ")} /></label>
        </ProfileSection>

        <CollapsibleSection id="receipt-numbers" title="Receipt numbers" subtitle="Set the starting number for the current paper series.">
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
        </CollapsibleSection>
      </SectionCollapseProvider>
    </div>
  );
}
