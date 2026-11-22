import Link from "next/link";
import { revalidatePath } from "next/cache";
import { fees, getSettings, toRupeeString, schoolLogoDataUri } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, LinkButton, Money, PageHeader } from "@/components/ui";
import { ReceiptRowsManager } from "./receipt-rows-manager";
import { FeeHeadFormCard } from "./add-fee-head";
import { FeeHeadsProvider } from "./fee-heads-context";

async function addHead(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const name = String(fd.get("name") || fd.get("customName") || "").trim();
  if (!name) return { ok: false, message: "Enter a fee head name", errors: { name: "Required" } };

  // Use preset code if available; otherwise code is auto-generated on backend from name
  const rawCode = String(fd.get("code") ?? "").trim().toUpperCase();
  const code = rawCode ? rawCode.replace(/[^A-Z0-9_]/g, "_").slice(0, 32) : undefined;

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

async function editHead(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const id = Number(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "Enter a fee head name", errors: { name: "Required" } };

  const rawCode = String(fd.get("code") ?? "").trim().toUpperCase();
  const type = String(fd.get("type") || "recurring") as "recurring" | "one_time" | "optional";
  const isRefundable = fd.has("isRefundable");

  const r = await run(
    () => fees.updateFeeHead(u, { id, name, code: rawCode || undefined, type, isRefundable }),
    `Fee head "${name}" updated`
  );
  revalidatePath("/fees");
  return r;
}

async function deleteHead(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const id = Number(fd.get("id"));
  const r = await run(() => fees.deleteFeeHead(u, id), "Fee head deleted");
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
  const settings = await getSettings();
  const concessionsOn = settings.concessionsEnabled;
  const [structs, conc, late, logoSrc] = await Promise.all([
    fees.listStructures(yearId),
    fees.listConcessionTypes(),
    fees.getLateFeeRule(yearId),
    schoolLogoDataUri(),
  ]);

  return (
    <FeeHeadsProvider>
      <div className="space-y-5">
        <PageHeader title="Fee setup" actions={
          <form className="toolbar"><select name="year" defaultValue={yearId}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}</select><button className="filter-button">Go</button></form>
        } />
        <Card
          title={`Fee structures ${year?.name ?? ""}`}
          actions={
            <LinkButton
              variant="secondary"
              size="sm"
              className="!border-accent/40 !bg-accent-soft/80 !text-accent-ink hover:!bg-accent hover:!text-white font-semibold shadow-xs"
              href="/settings?open=classes-sections#classes-sections"
            >
              Manage classes
            </LinkButton>
          }
        >
          <table className="data">
            <thead>
              <tr>
                <th>Class</th>
                <th className="text-center">Heads</th>
                <th className="text-center">Monthly</th>
                <th className="text-center">Yearly total</th>
                <th className="text-center w-28">Action</th>
              </tr>
            </thead>
            <tbody>{structs.map((s) => (
              <tr key={s.classId}>
                <td className="font-medium text-ink">{s.className}</td>
                <td className="text-center tabular-nums">{s.items}</td>
                <td className="text-center"><Money p={s.monthly} /></td>
                <td className="text-center"><Money p={s.annualTotal} /></td>
                <td className="text-center">
                  <Link
                    href={`/fees/structure/${yearId}/${s.classId}`}
                    className={
                      s.items
                        ? "inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-accent hover:bg-accent-soft hover:text-accent-ink transition"
                        : "inline-flex items-center justify-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-accent-ink transition"
                    }
                  >
                    {s.items ? "Edit" : "Set up →"}
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

        {/* Full-width: Add Fee Heads */}
        <FeeHeadFormCard
          existingHeads={m.heads}
          addAction={addHead}
          editAction={editHead}
        />

        {concessionsOn && (
          <Card title="Concession types">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Applies to</th>
                </tr>
              </thead>
              <tbody>
                {conc.map(({ t, headName }) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.kind === "percent" ? `${t.value / 100}%` : <Money p={t.value} />}</td>
                    <td>{headName ?? "All heads"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ActionForm action={addConcession} className="mt-3 flex flex-wrap gap-2" resetOnSuccess>
              <input name="name" placeholder="Name (e.g. Merit)" required />
              <select name="kind">
                <option value="percent">%</option>
                <option value="flat">Flat ₹</option>
              </select>
              <input name="value" placeholder="Value" className="w-20" required />
              <select name="feeHeadId">
                <option value="">All heads</option>
                {m.heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <Submit variant="secondary">Add</Submit>
              <FieldError name="value" />
            </ActionForm>
            <p className="mt-2 text-xs text-gray-500">
              Attach a concession to a student from their profile; it needs Accountant/Admin approval.
            </p>
          </Card>
        )}

        {/* Full-width: Setup Late Fee Rule */}
        <Card title={`Setup late fee rule ${year?.name ? `(${year.name})` : ""}`}>
          <ActionForm action={saveLate} className="flex flex-wrap items-end gap-3 sm:gap-4">
            <input type="hidden" name="academicYearId" value={yearId} />
            <label className="flex flex-col gap-1 min-w-[120px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Grace days</span>
              <input name="graceDays" type="number" defaultValue={late?.graceDays ?? 5} className="w-28 text-sm" />
            </label>
            <label className="flex flex-col gap-1 min-w-[160px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Kind</span>
              <select name="kind" defaultValue={late?.kind ?? "per_day"} className="text-sm">
                <option value="per_day">₹ per day late</option>
                <option value="flat">Flat ₹ once</option>
                <option value="percent">% of bill once</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-[140px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Amount (₹ or %)</span>
              <input
                name="amount"
                defaultValue={
                  late
                    ? late.kind === "percent"
                      ? String(late.amount / 100)
                      : toRupeeString(late.amount)
                    : "10"
                }
                className="w-32 text-sm"
              />
              <FieldError name="amount" />
            </label>
            <label className="flex flex-col gap-1 min-w-[160px]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                Maximum per bill (₹, 0 = none)
              </span>
              <input
                name="maxCap"
                defaultValue={late ? toRupeeString(late.maxCap) : "500"}
                className="w-36 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={late?.isActive ?? true}
                className="h-4 w-4 rounded text-accent"
              />
              <span>Active</span>
            </label>
            <div className="pb-0.5">
              <Submit>Save rule</Submit>
            </div>
          </ActionForm>
        </Card>

        <ReceiptRowsManager
          initialHeads={m.heads}
          saveRowsAction={saveRows}
          deleteHeadAction={deleteHead}
          school={{
            name: settings.name,
            address: settings.address,
            headerSubtitle: settings.headerSubtitle,
            udiseCode: settings.udiseCode,
            registrationNote: settings.registrationNote,
          }}
          logoSrc={logoSrc ?? undefined}
        />
      </div>
    </FeeHeadsProvider>
  );
}
