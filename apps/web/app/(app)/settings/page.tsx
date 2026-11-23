import { revalidatePath } from "next/cache";
import { fees, formatDate, sessions, getSettings, receiptNumberPreview, removeSchoolLogo, setNextReceiptNumber, setSchoolLogo, updateSchoolSettings } from "@sb/core";
import { setNextReceiptNumberSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { classOrder } from "@/lib/classes";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { LinkButton, PageHeader, SectionHeading, cx } from "@/components/ui";
import Link from "next/link";
import { ClassesSectionsManager } from "./classes-sections";
import { AcademicSessionsSection } from "./academic-sessions-section";
import { FolderPicker } from "@/components/folder-picker";
import { SectionCollapseProvider, SettingsQuickNav } from "./section-collapse";
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
  const r = await saveSection(_, fd, "Bill and receipt settings saved");
  // Start number for the receipt book: only sent while no receipt has been issued in this series
  const raw = fd.get("next");
  if (!r?.ok || raw === null || String(raw).trim() === "" || String(raw) === String(fd.get("nextWas"))) return r;
  const n = await setNextNumber(_, fd);
  return n?.ok ? { ok: true, message: `${r.message}. ${n.message}` } : n;
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

async function saveSession(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const reset = fd.get("reset") === "1";
  const r = await run(() => sessions.saveClassSession(u, {
    yearId: Number(fd.get("yearId")), classId: Number(fd.get("classId")),
    startDate: reset ? null : String(fd.get("startDate") || "") || null, endDate: reset ? null : String(fd.get("endDate") || "") || null,
  }), (x) => `Class ${x.className}, ${x.yearName}: ${formatDate(x.startDate)} – ${formatDate(x.endDate)}`);
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

const SETTINGS_NAV_ITEMS = [
  { id: "school-identity", label: "Identity" },
  { id: "contact-payment", label: "Contact & Payment" },
  { id: "bills-receipts", label: "Bills & Receipts" },
  { id: "reminder-timing", label: "Reminders" },
  { id: "features-backup", label: "Modules & Backup" },
  { id: "classes-sections", label: "Classes & Sections" },
  { id: "academic-sessions", label: "Sessions" },
  { id: "admission-numbering", label: "Numbering" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ sy?: string }> }) {
  const { sy: syParam } = await searchParams;
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
  // Class session dates: the year picked with the buttons (?sy=), else the current year.
  const sessYear = m.years.find((y) => y.id === Number(syParam)) ?? currentYear;
  const sessRows = sessYear ? await sessions.listSessions(sessYear.id) : [];

  return (
    <div className="page-stack">
      <PageHeader
        title="School settings"
        subtitle="Manage school identity, classes, academic sessions, and billing configuration."
        actions={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <LinkButton href="/settings/users" size="sm">Users</LinkButton>
            <LinkButton href="/settings/providers" size="sm">SMS / WhatsApp / Email</LinkButton>
            <LinkButton href="/settings/health" size="sm">Backups &amp; health</LinkButton>
          </div>
        }
      />

      <SectionCollapseProvider>
        {/* Quick Navigation Pills */}
        <div className="no-print -mt-4 mb-2 border-b border-gray-200/80 pb-3">
          <SettingsQuickNav items={SETTINGS_NAV_ITEMS} />
        </div>

        <div>
          <SectionHeading>School &amp; Operations</SectionHeading>
          <p className="hint -mt-1 mb-3">
            School identity, payment details, receipts, reminders and system modules. Click any card to expand.
          </p>
        </div>

        {/* 1. School Identity */}
        <ProfileSection
          id="school-identity"
          title="School Identity"
          subtitle="Name, managing body, address and registration details printed on bills and receipts."
          action={saveIdentity}
          saveLabel="Save school identity"
        >
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              School name <span className="text-xs font-normal text-gray-500">(printed in capitals on bills and receipts)</span>
            </span>
            <input name="name" defaultValue={s.name} required className="w-full min-w-0" />
          </label>
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              Line under the name <span className="text-xs font-normal text-gray-500">(e.g. managing society)</span>
            </span>
            <input name="headerSubtitle" defaultValue={s.headerSubtitle} placeholder="(Managed by … Parishad)" className="w-full min-w-0" />
          </label>
          <label className={field}>Address / location line<input name="address" defaultValue={s.address} placeholder="Village · Post · District" className="w-full min-w-0" /></label>
          <label className={field}>U-DISE code<input name="udiseCode" defaultValue={s.udiseCode} inputMode="numeric" placeholder="11-digit school code" className="w-full min-w-0" /></label>
          <label className={`${field} sm:col-span-2`}>
            <span className="flex items-baseline gap-1.5">
              Registration lines <span className="text-xs font-normal text-gray-500">(one per line)</span>
            </span>
            <textarea name="registrationNote" defaultValue={s.registrationNote} rows={2} placeholder="Govt. Recognised / Affiliation No. / Regn. No." className="w-full min-w-0" />
          </label>
          <SchoolLogoField hasLogo={!!s.logoPath} version={s.logoPath ?? ""} />
        </ProfileSection>

        {/* 2. Contact & Payment */}
        <ProfileSection
          id="contact-payment"
          title="Contact &amp; Payment"
          subtitle="Phone, official email and UPI ID used for QR payments on receipts."
          action={saveContact}
          saveLabel="Save contact & payment"
        >
          <label className={field}>Phone<input name="phone" defaultValue={s.phone} placeholder="+91 98765 43210" className="w-full min-w-0" /></label>
          <label className={field}>Email<input name="email" defaultValue={s.email} placeholder="office@school.edu" className="w-full min-w-0" /><FieldError name="email" /></label>
          <label className={`${field} sm:col-span-2`}>
            <span className="flex items-baseline gap-1.5">
              UPI ID <span className="rounded-full bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">QR Code on receipts</span>
              <span className="text-xs font-normal text-gray-500">(printed as scannable payment QR code on bills and receipts)</span>
            </span>
            <input name="upiId" defaultValue={s.upiId ?? ""} placeholder="schoolname@bank" className="w-full min-w-0 font-mono text-sm" />
          </label>
        </ProfileSection>

        {/* 3. Bills & Receipts */}
        <ProfileSection
          id="bills-receipts"
          title="Bills &amp; Receipts"
          subtitle="Series prefixes, numbering format, and starting receipt counter."
          action={saveBilling}
          saveLabel="Save bills & receipts"
        >
          <label className={field}>Bill prefix<input name="invoicePrefix" defaultValue={s.invoicePrefix} placeholder="INV" className="w-full min-w-0" /></label>
          <label className={field}>Receipt prefix<input name="receiptPrefix" defaultValue={s.receiptPrefix} placeholder="REC" className="w-full min-w-0" /><FieldError name="receiptPrefix" /></label>
          <label className={field}>Receipt numbering
            <select name="receiptNumbering" defaultValue={s.receiptIncludeYear ? "per_year" : "continuous"} className="w-full min-w-0">
              <option value="continuous">One running series ({s.receiptPrefix}/6434)</option>
              <option value="per_year">Restarts every academic year ({s.receiptPrefix}/2026-27/1)</option>
            </select></label>
          <label className={field}>
            <span className="flex items-baseline gap-1.5">
              Number digits <span className="text-xs font-normal text-gray-500">(1 = no leading zeros, 4 = 0001)</span>
            </span>
            <input name="receiptDigits" type="number" min={1} max={10} defaultValue={s.receiptDigits} className="w-full min-w-0" />
            <FieldError name="receiptDigits" />
          </label>
          {num && (num.canSetStart ? (
            <label className={`${field} sm:col-span-2`}>
              <span className="flex items-baseline gap-1.5">
                First receipt number <span className="text-xs font-normal text-gray-500">(only if continuing a paper book: e.g. at 6434, enter 6435)</span>
              </span>
              <input name="next" type="number" min={1} defaultValue={num.next} className="w-full min-w-0" />
              <input type="hidden" name="nextWas" value={num.next} />
              <FieldError name="next" />
            </label>
          ) : (
            <div className="sm:col-span-2 rounded-lg border border-accent/30 bg-accent-soft/60 px-4 py-2.5 text-xs text-accent-ink flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <span>Next receipt counter: <b className="font-mono text-sm font-bold bg-white px-2 py-0.5 rounded border border-accent/25 text-accent-ink shadow-2xs">{num.text}</b></span>
              <span className="text-gray-500 font-medium">({num.issued} issued so far)</span>
            </div>
          ))}
        </ProfileSection>

        {/* 4. Reminder Timing */}
        <ProfileSection
          id="reminder-timing"
          title="Reminder Timing &amp; Quiet Hours"
          subtitle="Quiet hours and automated overdue message schedule."
          action={saveReminders}
          saveLabel="Save reminder timing"
        >
          <label className={field}>Send messages from<input name="quietStart" defaultValue={s.quietStart} className="w-full min-w-0" /><FieldError name="quietStart" /></label>
          <label className={field}>…until<input name="quietEnd" defaultValue={s.quietEnd} className="w-full min-w-0" /><FieldError name="quietEnd" /></label>
          <label className={field}>Reminder days before due<input name="reminderDaysBefore" type="number" defaultValue={s.reminderDaysBefore} className="w-full min-w-0" /></label>
          <label className={field}>Overdue reminders after (days)<input name="overdueSteps" defaultValue={s.overdueSteps.join(", ")} className="w-full min-w-0" /></label>
        </ProfileSection>

        {/* 5. Features & Backup */}
        <ProfileSection
          id="features-backup"
          title="Modules &amp; Backup"
          subtitle="Automated backup directory and optional platform modules."
          action={saveFeatures}
          saveLabel="Save module settings"
        >
          <label className={`${field} sm:col-span-2`}>
            <span className="flex items-baseline gap-1.5">
              Backup folder <span className="text-xs font-normal text-gray-500">(external disk or secondary partition recommended)</span>
            </span>
            <FolderPicker name="backupPath" defaultValue={s.backupPath ?? ""} placeholder="D:\SchoolBackups" />
          </label>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-gray-200/90 bg-subtle/50 p-3.5 hover:border-accent/40 transition-all cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft/20 has-[:checked]:ring-1 has-[:checked]:ring-accent/30">
              <input type="checkbox" name="concessionsEnabled" defaultChecked={s.concessionsEnabled} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-ink">Fee Concessions</span>
                  <span className="rounded bg-brand-50 border border-brand-200/70 px-1.5 py-0.2 text-[9px] font-semibold text-brand-800">Optional</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">Sibling, staff ward, or merit discounts applied when generating bills.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-gray-200/90 bg-subtle/50 p-3.5 hover:border-accent/40 transition-all cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft/20 has-[:checked]:ring-1 has-[:checked]:ring-accent/30">
              <input type="checkbox" name="dayCloseEnabled" defaultChecked={s.dayCloseEnabled} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-ink">Cash Counter Closing</span>
                  <span className="rounded bg-brand-50 border border-brand-200/70 px-1.5 py-0.2 text-[9px] font-semibold text-brand-800">Optional</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">Cashiers count physical drawer and lock the day. Most schools leave this off.</p>
              </div>
            </label>
          </div>
        </ProfileSection>

        <div className="pt-4 border-t border-gray-200/80">
          <SectionHeading>Academics &amp; Structure</SectionHeading>
          <p className="hint -mt-1 mb-3">
            Create classes, rename sections, manage academic sessions, and configure admission &amp; roll numbering sequences.
          </p>
        </div>

        {/* 6. Classes & Sections */}
        <ClassesSectionsManager
          classes={classItems}
          add={addClassSection}
          removeClass={removeClassAction}
          removeSection={removeSectionAction}
        />

        {/* 7. Academic Sessions */}
        <AcademicSessionsSection
          years={m.years}
          makeCurrent={makeCurrent}
          addYear={addYear}
          saveSession={saveSession}
          sessYear={sessYear}
          sessRows={sessRows}
        />

        {/* 8. Admission & Roll Numbering */}
        <ProfileSection
          id="admission-numbering"
          title="Admission &amp; Roll Numbering"
          subtitle="Configure automated admission numbering pattern and student roll sequences."
          action={saveNumbering}
          saveLabel="Save numbering formats"
        >
          <NumberingFormatFields s={s} currentYear={currentYear} />
        </ProfileSection>
      </SectionCollapseProvider>
    </div>
  );
}
