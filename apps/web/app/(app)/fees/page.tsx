import Link from "next/link";
import { revalidatePath } from "next/cache";
import { fees, getSettings, toRupeeString } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, Money, PageHeader } from "@/components/ui";

async function addHead(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.createFeeHead(u, formObject(fd)), "Fee head added");
  revalidatePath("/fees");
  return r;
}
async function addConcession(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.createConcessionType(u, formObject(fd)), "Concession type added");
  revalidatePath("/fees");
  return r;
}
async function saveLate(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.saveLateFeeRule(u, formObject(fd)), "Late-fee rule saved");
  revalidatePath("/fees");
  return r;
}
async function copy(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.copyStructures(u, Number(fd.get("from")), Number(fd.get("to")), Number(fd.get("hike") || 0)), (x) => `Copied ${x.copied} item(s)`);
  revalidatePath("/fees");
  return r;
}

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireRole("fees");
  const m = await fees.masters();
  const current = (await getWorkingYear()).year;
  const yearId = Number((await searchParams).year ?? current?.id);
  const year = m.years.find((y) => y.id === yearId);
  const concessionsOn = (await getSettings()).concessionsEnabled;
  const [structs, conc, late] = await Promise.all([fees.listStructures(yearId), fees.listConcessionTypes(), fees.getLateFeeRule(yearId)]);
  return (
    <div className="space-y-5">
      <PageHeader title="Fee setup" actions={
        <form className="flex gap-2"><select name="year" defaultValue={yearId}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</select><button className="rounded-md border border-gray-300 bg-white px-3 text-sm">Go</button></form>
      } />
      <Card title={`Fee structures ${year?.name ?? ""}`}>
        <table className="data">
          <thead><tr><th>Class</th><th className="num">Heads</th><th className="num">Monthly</th><th className="num">Yearly total</th><th /></tr></thead>
          <tbody>{structs.map((s) => (
            <tr key={s.classId}><td>{s.className}</td><td className="num">{s.items}</td><td className="num"><Money p={s.monthly} /></td><td className="num"><Money p={s.annualTotal} /></td>
              <td className="text-right"><Link className="text-brand-700 hover:underline" href={`/fees/structure/${yearId}/${s.classId}`}>{s.items ? "Edit" : "Set up"}</Link></td></tr>
          ))}</tbody>
        </table>
        <ActionForm action={copy} className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
          <span className="text-sm">Copy all structures from</span>
          <select name="from">{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          <span className="text-sm">to</span>
          <select name="to" defaultValue={yearId}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          <label className="flex items-center gap-1 text-sm">hike %<input name="hike" type="number" step="0.1" defaultValue={0} className="w-20" /></label>
          <Submit variant="secondary" confirm="Copy structures? Existing heads in the target year are kept.">Copy</Submit>
        </ActionForm>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Fee heads">
          <table className="data"><thead><tr><th>Code</th><th>Name</th><th>Type</th></tr></thead>
            <tbody>{m.heads.map((h) => <tr key={h.id}><td className="font-mono text-xs">{h.code}</td><td>{h.name}{h.isRefundable ? " (refundable)" : ""}</td><td>{h.type.replace("_", " ")}</td></tr>)}</tbody></table>
          <ActionForm action={addHead} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
            <input name="code" placeholder="CODE" className="w-28" required /><input name="name" placeholder="Name" required />
            <select name="type"><option value="recurring">Recurring</option><option value="one_time">One-time</option><option value="optional">Optional</option></select>
            <label className="flex items-center gap-1"><input type="checkbox" name="isRefundable" />Refundable</label>
            <Submit variant="secondary">Add</Submit><FieldError name="code" />
          </ActionForm>
        </Card>

        {concessionsOn && (
        <Card title="Concession types">
          <table className="data"><thead><tr><th>Name</th><th>Value</th><th>Applies to</th></tr></thead>
            <tbody>{conc.map(({ t, headName }) => <tr key={t.id}><td>{t.name}</td><td>{t.kind === "percent" ? `${t.value / 100}%` : <Money p={t.value} />}</td><td>{headName ?? "All heads"}</td></tr>)}</tbody></table>
          <ActionForm action={addConcession} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
            <input name="name" placeholder="Name (e.g. Merit)" required />
            <select name="kind"><option value="percent">%</option><option value="flat">Flat ₹</option></select>
            <input name="value" placeholder="Value" className="w-20" required />
            <select name="feeHeadId"><option value="">All heads</option>{m.heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <Submit variant="secondary">Add</Submit><FieldError name="value" />
          </ActionForm>
          <p className="mt-2 text-xs text-gray-500">Attach a concession to a student from their profile; it needs Accountant/Admin approval.</p>
        </Card>
        )}

        <Card title={`Late fee rule ${year?.name ?? ""}`}>
          <ActionForm action={saveLate} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="academicYearId" value={yearId} />
            <label className="flex flex-col gap-1">Grace days<input name="graceDays" type="number" defaultValue={late?.graceDays ?? 5} /></label>
            <label className="flex flex-col gap-1">Kind<select name="kind" defaultValue={late?.kind ?? "per_day"}><option value="per_day">₹ per day late</option><option value="flat">Flat ₹ once</option><option value="percent">% of bill once</option></select></label>
            <label className="flex flex-col gap-1">Amount (₹ or %)<input name="amount" defaultValue={late ? (late.kind === "percent" ? String(late.amount / 100) : toRupeeString(late.amount)) : "10"} /><FieldError name="amount" /></label>
            <label className="flex flex-col gap-1">Maximum per bill (₹, 0 = none)<input name="maxCap" defaultValue={late ? toRupeeString(late.maxCap) : "500"} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={late?.isActive ?? true} />Active</label>
            <div><Submit>Save rule</Submit></div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
