import { revalidatePath } from "next/cache";
import { fees, ops, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear, nextYear } from "@/lib/year";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";

async function promote(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const b = await ops.runBackup("pre_promotion");
  if (!b.ok) return { ok: false, message: `Backup before promotion failed, nothing changed: ${b.error}` };
  const to = String(fd.get("toClassId"));
  const r = await run(() => students.promoteClass(u, {
    fromYearId: Number(fd.get("fromYearId")), fromClassId: Number(fd.get("fromClassId")),
    toClassId: to === "alumni" ? "alumni" : Number(to), newYearId: Number(fd.get("newYearId")),
  }), (x) => `Promoted ${x.moved} student(s); dues carried forward for ${x.carried}${x.skipped ? `; ${x.skipped} already had a record in the new year and were skipped` : ""}. Backup: ${b.file}`);
  revalidatePath("/students");
  return r;
}

export default async function Promotion() {
  await requireRole("settings");
  const m = await fees.masters();
  const { year } = await getWorkingYear();
  const target = nextYear(m.years, year.id);
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Year-end promotion (whole class)" actions={<LinkButton href="/settings">Back</LinkButton>} />
      {!target && <Notice tone="warn">There is no academic year after {year.name} yet. Add it under <b>Settings → Academic years</b> first (and copy the fee structure under Fee setup).</Notice>}
      <Notice>
        Each student gets a <b>new record for the new academic year</b> in the new class; their old-year record, bills and payments stay unchanged as history.
        Unpaid dues are carried into the new year as an “Opening balance” bill. Promote the <b>highest class first</b> (XII → passed out, then XI → XII …).
        A backup is taken automatically before each run. To promote a single student, use <b>Promote</b> on the student&apos;s profile.
      </Notice>
      <Card>
        <ActionForm action={promote} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">From academic year<select name="fromYearId" defaultValue={year.id}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">From class<select name="fromClassId">{m.classes.slice().reverse().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">Into academic year<select name="newYearId" defaultValue={target?.id}>{m.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">Into class<select name="toClassId"><option value="alumni">Passed out (alumni)</option>{m.classes.slice().reverse().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="sm:col-span-2"><Submit variant="danger" confirm="Promote every student studying in this class?">Promote class</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
