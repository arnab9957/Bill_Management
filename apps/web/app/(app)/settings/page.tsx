import { revalidatePath } from "next/cache";
import { fees, getSettings, receiptNumberPreview, removeSchoolLogo, setNextReceiptNumber, setSchoolLogo, updateSchoolSettings } from "@sb/core";
import { setNextReceiptNumberSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { classOrder } from "@/lib/classes";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { LinkButton } from "@/components/ui";
import { ClassesSectionsManager } from "./classes-sections";
import { CollapsibleSection, SectionCollapseProvider } from "./section-collapse";
import { ProfileSection } from "./profile-section";
import { NumberingFormatFields } from "./numbering-format-fields";
import { SchoolLogoField } from "./school-logo-field";

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

async function saveNumbering(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const raw = formObject(fd);
  raw.rollPrefixSection = fd.has("rollPrefixSection");
  const u = await requireRole("settings");
  const r = await run(() => updateSchoolSettings(u, raw), "Admission and roll number formats saved");
  revalidatePath("/", "layout");
  return r;
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

async function addClassSection(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const mode = String(fd.get("mode") ?? "create");
  const renamed = "Renamed. Students stay in the same class/section; lists and reports show the new name.";
  if (mode === "class") {
    const r = await run(() => fees.renameClass(u, Number(fd.get("id")), String(fd.get("className") ?? "")), renamed);
    revalidatePath("/", "layout");
    return r;
  }
  if (mode === "section") {
    const section = String(fd.get("section") ?? "");
    if (!section.trim()) return { ok: false, message: "Enter a section name", errors: { section: "Required" } };
    const r = await run(() => fees.renameSection(u, Number(fd.get("id")), section), renamed);
    revalidatePath("/", "layout");
    return r;
  }
  const className = String(fd.get("className") ?? "");
  const section = String(fd.get("section") ?? "");
  if (!className.trim()) return { ok: false, message: "Enter a class name", errors: { className: "Required" } };
  if (mode === "createSection" && !section.trim()) return { ok: false, message: "Enter a section name", errors: { section: "Required" } };
  const targetClassId = mode === "createSection" ? Number(fd.get("classId")) : undefined;
  const studentIds = fd.getAll("studentIds").map(Number);
  const r = await run(() => fees.addClassWithSection(u, className, classOrder(className), section, studentIds, targetClassId), (res) =>
    !res.sectionAdded ? "Class created" : res.moved
      ? `Section ${section.trim()} created and ${res.moved} students moved into it`
      : res.created ? "Class and section created" : "Section added");
  revalidatePath("/settings");
  return r;
}

async function removeClassAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const id = Number(fd.get("id"));
  const r = await run(() => fees.removeClass(u, id), "Class removed");
  revalidatePath("/settings");
  return r;
}

async function removeSectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const id = Number(fd.get("id"));
  const r = await run(() => fees.removeSection(u, id), "Section removed");
  revalidatePath("/settings");
  return r;
}

const field = "field-stack";
const hint = "hint";

export default async function SettingsPage() {
  await requireRole("settings");
  const [s, m, usage, studentLists, num] = await Promise.all([
    getSettings(),
    fees.masters(),
    fees.classSectionUsage(),
    fees.classStudentLists(),
    receiptNumberPreview(),
  ]);
  const classItems = m.classes.map((c) => ({
    id: c.id,
    name: c.name,
    used: usage.usedClassIds.has(c.id),
    students: studentLists.get(c.id) ?? [],
    sections: m.sections.filter((sec) => sec.classId === c.id).map((sec) => ({ id: sec.id, name: sec.name, used: usage.usedSectionIds.has(sec.id) })),
  }));
  const currentYear = m.years.find((y) => y.isCurrent) ?? m.years[0];
  const totalStudents = classItems.reduce((n, c) => n + c.students.length, 0);
  const totalSections = classItems.reduce((n, c) => n + c.sections.length, 0);

  return (
    <div className="page-stack">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        <div className="border-b border-gray-200/70 bg-tint/70 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="inline-flex rounded-full bg-highlight-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink">Administration</div>
              <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">School Settings</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">School identity, classes, academic sessions, bills, admission numbering and payment settings.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-teal/20 bg-teal/5 px-3 py-1.5 text-xs font-medium text-teal">{currentYear ? `Current session · ${currentYear.name}` : "No current session"}</span>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">{classItems.length} classes</span>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">{totalSections} sections</span>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">{totalStudents} students</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton href="/settings/users">Users</LinkButton>
              <LinkButton href="/settings/providers">SMS / WhatsApp / Email</LinkButton>
              <LinkButton href="/settings/health">Backups & health</LinkButton>
            </div>
          </div>
        </div>
      </div>

      <SectionCollapseProvider>
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-ink">
              School & Operations
            </span>
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-ink">
            General & Billing Configuration
          </h2>
          <p className="text-xs text-gray-500">
            School identity, payment details, receipts, reminders and system modules.
          </p>
        </div>

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

        <ProfileSection id="reminder-timing" title="Reminder timing" subtitle="Quiet hours and the overdue reminder schedule." action={saveReminders} saveLabel="Save reminder timing">
          <label className={field}>Send messages from<input name="quietStart" defaultValue={s.quietStart} /><FieldError name="quietStart" /></label>
          <label className={field}>…until<input name="quietEnd" defaultValue={s.quietEnd} /><FieldError name="quietEnd" /></label>
          <label className={field}>Reminder days before due<input name="reminderDaysBefore" type="number" defaultValue={s.reminderDaysBefore} /></label>
          <label className={field}>Overdue reminders after (days)<input name="overdueSteps" defaultValue={s.overdueSteps.join(", ")} /></label>
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

        <div className="pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-ink">
              Academics & Structure
            </span>
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-ink">
            Classes, Sessions & Numbering
          </h2>
          <p className="text-xs text-gray-500">
            Create classes, rename sections, manage academic sessions, and configure admission & roll numbering sequences.
          </p>
        </div>

        <ClassesSectionsManager
          classes={classItems}
          add={addClassSection}
          removeClass={removeClassAction}
          removeSection={removeSectionAction}
        />

        <CollapsibleSection id="academic-sessions" title="Academic sessions" subtitle="Create sessions and choose the active one.">
          <ul className="space-y-1 text-sm">{m.years.map((y) => (
            <li key={y.id} className="flex justify-between items-center py-1">
              <span><b>{y.name}</b> <span className="text-gray-500">({y.startDate} → {y.endDate})</span></span>
              {y.isCurrent ? <b className="text-ink">current</b> : <form action={makeCurrent.bind(null, y.id)}><button className="text-xs text-ink hover:underline">Make current</button></form>}
            </li>
          ))}</ul>
          <ActionForm action={addYear} className="mt-4 border-t border-gray-100 pt-3" resetOnSuccess>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[1.1fr_1.2fr_1.2fr_auto] items-center gap-x-2.5 gap-y-1.5 min-w-[380px]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Academic session</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Start date</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">End date</span>
                <span></span>

                <input name="name" placeholder="2027-28" required className="min-w-0" />
                <input type="date" name="startDate" required className="min-w-0" />
                <input type="date" name="endDate" required className="min-w-0" />
                <Submit variant="secondary">Add</Submit>
              </div>
            </div>
            <FieldError name="name" />
            <FieldError name="endDate" />
          </ActionForm>
        </CollapsibleSection>

        <ProfileSection id="admission-numbering" title="Admission & Roll Numbering" subtitle="How admission numbers and roll numbers are generated." action={saveNumbering} saveLabel="Save numbering formats">
          <NumberingFormatFields s={s} currentYear={currentYear} />
        </ProfileSection>
      </SectionCollapseProvider>
    </div>
  );
}
