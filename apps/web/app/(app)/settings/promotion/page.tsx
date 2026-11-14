import { revalidatePath } from "next/cache";
import { fees, ops, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";

async function promote(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const b = await ops.runBackup("pre_promotion");
  if (!b.ok) return { ok: false, message: `Backup before promotion failed, nothing changed: ${b.error}` };
  const to = String(fd.get("toClassId"));
  const r = await run(() => students.promoteClass(u, { fromClassId: Number(fd.get("fromClassId")), toClassId: to === "alumni" ? "alumni" : Number(to), newYearId: Number(fd.get("newYearId")) }),
    (x) => `Moved ${x.moved} student(s); dues carried forward for ${x.carried}. Backup: ${b.file}`);
  revalidatePath("/students");
  return r;
}

export default async function Promotion() {
  await requireRole("settings");
  const m = await fees.masters();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Year-end promotion" actions={<LinkButton href="/settings">Back</LinkButton>} />
      <Notice tone="warn">Promote from the <b>highest class first</b> (XII → alumni, then XI → XII, …) so classes don&apos;t mix. A backup is taken automatically before each run. Unpaid dues move into the new year as an “Opening balance” bill. Sections are cleared — reassign them afterwards.</Notice>
      <Card>
        <ActionForm action={promote} className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">From class<select name="fromClassId">{m.classes.slice().reverse().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">To class<select name="toClassId"><option value="alumni">Passed out (alumni)</option>{m.classes.slice().reverse().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">New academic year<select name="newYearId">{m.years.slice().reverse().map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <div className="sm:col-span-3"><Submit variant="danger" confirm="Promote all active students of this class?">Promote</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
