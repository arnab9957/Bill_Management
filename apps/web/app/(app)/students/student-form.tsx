import { fees } from "@sb/core";
import { FieldError } from "@/components/action-form";
import type { Student, Guardian } from "@sb/db";

/** Shared admission / edit fields (server component rendered inside an ActionForm). */
export async function StudentFields({ s, withGuardian, guardian }: { s?: Student; withGuardian?: boolean; guardian?: Guardian }) {
  const m = await fees.masters();
  return (
    <div className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold text-gray-800">Student</legend>
        <L label="Admission no. *" name="admissionNo"><input name="admissionNo" defaultValue={s?.admissionNo} required /></L>
        <L label="Full name *" name="name" className="sm:col-span-2"><input name="name" defaultValue={s?.name} required /></L>
        <L label="Class *" name="classId">
          <select name="classId" defaultValue={s?.classId} required><option value="" />{m.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </L>
        <L label="Section" name="sectionId">
          <select name="sectionId" defaultValue={s?.sectionId ?? ""}><option value="" />{m.sections.map((x) => <option key={x.id} value={x.id}>{m.classes.find((c) => c.id === x.classId)?.name}-{x.name}</option>)}</select>
        </L>
        <L label="Roll no." name="rollNo"><input name="rollNo" defaultValue={s?.rollNo ?? ""} /></L>
        <L label="Date of birth" name="dob"><input type="date" name="dob" defaultValue={s?.dob ?? ""} /></L>
        <L label="Gender" name="gender"><select name="gender" defaultValue={s?.gender ?? ""}><option value="" /><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></select></L>
        <L label="Admission date *" name="admissionDate"><input type="date" name="admissionDate" defaultValue={s?.admissionDate ?? new Date().toISOString().slice(0, 10)} required /></L>
        <L label="Transport route" name="transportRouteId">
          <select name="transportRouteId" defaultValue={s?.transportRouteId ?? ""}><option value="">None</option>{m.routes.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </L>
      </fieldset>
      {withGuardian && <GuardianFields g={guardian} prefix="guardian." />}
    </div>
  );
}

export function GuardianFields({ g, prefix = "" }: { g?: Guardian; prefix?: string }) {
  const n = (k: string) => `${prefix}${k}`;
  return (
    <fieldset className="grid gap-4 sm:grid-cols-3">
      <legend className="mb-2 text-sm font-semibold text-gray-800">Parent / guardian (receives fee messages)</legend>
      <L label="Name *" name={n("name")}><input name={n("name")} defaultValue={g?.name} /></L>
      <L label="Relation" name={n("relation")}><input name={n("relation")} defaultValue={g?.relation ?? "Father"} /></L>
      <L label="Mobile * (10 digits)" name={n("mobile")}><input name={n("mobile")} defaultValue={g?.mobile} inputMode="numeric" maxLength={10} /></L>
      <L label="WhatsApp no. (if different)" name={n("whatsappNo")}><input name={n("whatsappNo")} defaultValue={g?.whatsappNo ?? ""} inputMode="numeric" maxLength={10} /></L>
      <L label="Email" name={n("email")}><input type="email" name={n("email")} defaultValue={g?.email ?? ""} /></L>
      <L label="Language" name={n("preferredLanguage")}><select name={n("preferredLanguage")} defaultValue={g?.preferredLanguage ?? "en"}><option value="en">English</option><option value="hi">Hindi</option></select></L>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
        <label className="flex items-center gap-1.5"><input type="checkbox" name={n("notifySms")} defaultChecked={g?.notifySms ?? true} />SMS</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name={n("notifyWhatsapp")} defaultChecked={g?.notifyWhatsapp ?? true} />WhatsApp</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name={n("notifyEmail")} defaultChecked={g?.notifyEmail ?? true} />Email</label>
        <label className="flex items-center gap-1.5 font-medium"><input type="checkbox" name={n("messagingConsent")} defaultChecked={g?.messagingConsent ?? false} />Parent consented to fee messages (admission form)</label>
      </div>
    </fieldset>
  );
}

function L({ label, name, className, children }: { label: string; name: string; className?: string; children: React.ReactNode }) {
  return <div className={`flex flex-col gap-1 ${className ?? ""}`}><label htmlFor={name}>{label}</label>{children}<FieldError name={name} /></div>;
}
