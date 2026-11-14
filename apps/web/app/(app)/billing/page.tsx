import { revalidatePath } from "next/cache";
import { billing, fees, periodOf, today } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { RunResult } from "./result";

async function runBilling(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("billing");
  const commit = fd.get("intent") === "commit";
  const classIds = fd.getAll("classIds").map(Number).filter(Boolean);
  const r = await run(() => billing.generateInvoices({ period: String(fd.get("period")), classIds, dryRun: !commit }, user),
    (x) => commit ? `Created ${x.created.length} bill(s). ${x.skipped.length} skipped.` : `Preview: ${x.planned.length} bill(s) would be created.`);
  if (commit) revalidatePath("/invoices");
  return r;
}

export default async function BillingPage() {
  await requireRole("billing");
  const { classes } = await fees.masters();
  const { year } = await getWorkingYear();
  const now = periodOf(today());
  const defaultPeriod = now >= periodOf(year.startDate) && now <= periodOf(year.endDate) ? now : periodOf(year.startDate);
  return (
    <div className="space-y-4">
      <PageHeader title="Bill run" subtitle="Bills are generated automatically on the 1st of each month. Use this to run now for a class or month." />
      <Notice>Academic year <b>{year.name}</b>: only students enrolled in {year.name} are billed, using their {year.name} class and fee structure. Always <b>Preview</b> first. Re-running a month never creates duplicates — students already billed are skipped.</Notice>
      <Card>
        <ActionForm action={runBilling}>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">Month<input type="month" name="period" defaultValue={defaultPeriod} min={periodOf(year.startDate)} max={periodOf(year.endDate)} required /></label>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-700">Classes (none selected = all)</span>
              <div className="flex max-w-3xl flex-wrap gap-x-3 gap-y-1">
                {classes.map((c) => <label key={c.id} className="flex items-center gap-1"><input type="checkbox" name="classIds" value={c.id} />{c.name}</label>)}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button name="intent" value="preview" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium">Preview</button>
            <SubmitCommit />
          </div>
          <RunResult />
        </ActionForm>
      </Card>
    </div>
  );
}

function SubmitCommit() {
  return <Submit name="intent" value="commit" confirm="Generate bills now? Parents will be notified.">Generate bills</Submit>;
}
