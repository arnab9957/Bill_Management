import Link from "next/link";
import { revalidatePath } from "next/cache";
import { fees, getSettings, toRupeeString } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, LinkButton, Money, PageHeader } from "@/components/ui";
import { ReceiptRowsManager } from "./receipt-rows-manager";
import { AddFeeHeadSection } from "./add-fee-head";

async function addHead(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const isCustom = fd.get("preset") === "__custom__";
  const name = String(isCustom ? fd.get("customName") : fd.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Enter a fee head name", errors: { name: "Required" } };

  let code = String(isCustom ? (fd.get("customCode") || name) : fd.get("code") ?? "").trim().toUpperCase();
  code = code.replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!code) code = "FEE_" + Date.now().toString(36).toUpperCase();

  const type = String(fd.get("type") || fd.get("customType") || "recurring") as "recurring" | "one_time" | "optional";
  const isRefundable = fd.has("isRefundable");
  const printOnReceipt = fd.has("printOnReceipt") || !fd.has("preset");
  const receiptLabel = String(fd.get("receiptLabel") ?? "").trim() || null;

  const r = await run(async () => {
    const h = await fees.createFeeHead(u, { code, name, type, isRefundable });
    if (printOnReceipt && h?.id) {
      const m = await fees.masters();
      const maxOrder = Math.max(0, ...m.heads.map((x) => x.receiptOrder ?? 0));
      const existingRows = m.heads.map((x) => ({
        id: x.id,
        show: x.receiptOrder != null,
        order: x.receiptOrder,
        label: x.receiptLabel,
      }));
      await fees.saveReceiptRows(u, [
        ...existingRows,
        { id: h.id, show: true, order: maxOrder + 1, label: receiptLabel }
      ]);
    }
    return h;
  }, printOnReceipt ? `Fee head "${name}" added & scheduled on receipts` : `Fee head "${name}" added`);
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
async function saveRows(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const rows = fd.getAll("ids").map(Number).map((id) => {
    const n = Number(String(fd.get(`order_${id}`) ?? "").trim());
    return {
      id,
      show: fd.get(`show_${id}`) === "on" || fd.get(`show_${id}`) === "true",
      order: Number.isInteger(n) && n >= 1 ? n : null,
      label: String(fd.get(`label_${id}`) ?? "").trim() || null
    };
  });
  // A head that is ticked but has no number goes after the last numbered one.
  let next = Math.max(0, ...rows.filter((x) => x.show && x.order).map((x) => x.order!)) + 1;
  for (const x of rows) if (x.show && !x.order) x.order = next++;
  const r = await run(() => fees.saveReceiptRows(u, rows), "Receipt rows saved");
  revalidatePath("/fees");
  return r ? { ok: r.ok, message: r.message, errors: r.errors } : r;
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
        <form className="toolbar"><select name="year" defaultValue={yearId}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</select><button className="filter-button">Go</button></form>
      } />
      <Card
        title={`Fee structures ${year?.name ?? ""}`}
        actions={<LinkButton variant="secondary" size="sm" href="/settings?open=classes-sections#classes-sections">Manage classes</LinkButton>}
      >
        <table className="data">
          <thead>
            <tr>
              <th>Class</th>
              <th className="text-center">Heads</th>
              <th className="text-center">Monthly</th>
              <th className="text-center">Yearly total</th>
              <th className="text-center" />
            </tr>
          </thead>
          <tbody>{structs.map((s) => (
            <tr key={s.classId}>
              <td>{s.className}</td>
              <td className="text-center tabular-nums">{s.items}</td>
              <td className="text-center"><Money p={s.monthly} /></td>
              <td className="text-center"><Money p={s.annualTotal} /></td>
              <td className="text-center">
                <Link className="text-ink hover:underline" href={`/fees/structure/${yearId}/${s.classId}`}>
                  {s.items ? "Edit" : "Set up"}
                </Link>
              </td>
            </tr>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Add Fee Heads">
          <AddFeeHeadSection existingHeads={m.heads} action={addHead} />
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

      <Card title="Rows printed on receipts and bills">
        <ReceiptRowsManager initialHeads={m.heads} saveRowsAction={saveRows} />
      </Card>
    </div>
  );
}
