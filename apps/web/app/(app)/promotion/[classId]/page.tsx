import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fees, ops, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, LinkButton, Money, Notice, PageHeader } from "@/components/ui";

async function promote(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const ids = fd.getAll("ids").map(Number);
  const decisions = ids.map((studentId) => ({ studentId, action: String(fd.get(`a_${studentId}`) ?? "skip") as students.PromoteAction }));
  if (!decisions.some((d) => d.action !== "skip")) return { ok: false, message: "Nothing chosen: every student is set to “Not now”." };
  const b = await ops.runBackup("pre_promotion");
  if (!b.ok) return { ok: false, message: `Backup before promotion failed, nothing changed: ${b.error}` };
  const to = String(fd.get("toClassId"));
  const r = await run(() => students.promoteStudents(u, {
    fromYearId: Number(fd.get("from")), toYearId: Number(fd.get("to")), classId: Number(fd.get("classId")),
    toClassId: to === "alumni" ? "alumni" : Number(to), rollMode: fd.get("rollMode") === "clear" ? "clear" : "keep", decisions,
  }), (x) => [
    x.promoted && `${x.promoted} promoted`, x.passedOut && `${x.passedOut} passed out`, x.repeated && `${x.repeated} repeating`,
    x.left && `${x.left} left`, x.skipped && `${x.skipped} not moved`, x.carried && `dues carried for ${x.carried}`,
  ].filter(Boolean).join(", ") + (x.problems.length ? `. Note: ${x.problems.join("; ")}` : "") + `. Backup: ${b.file}`);
  revalidatePath("/promotion");
  revalidatePath("/students");
  return r;
}
async function change(studentId: number, fromYearId: number, toYearId: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const action = String(fd.get("action")) as "promote" | "repeat" | "leave";
  const r = await run(() => students.changePromotion(u, { studentId, fromYearId, toYearId, action }), (x) => `${x.name}: now ${x.now}`);
  revalidatePath("/promotion");
  return r;
}
async function undo(studentId: number, toYearId: number, _: ActionState): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => students.undoPromotion(u, studentId, toYearId), (x) => `Promotion undone for ${x.name}`);
  revalidatePath("/promotion");
  return r;
}

export default async function PromoteClass({ params, searchParams }: { params: Promise<{ classId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireRole("settings");
  const classId = Number((await params).classId);
  const sp = await searchParams;
  const m = await fees.masters();
  const from = m.years.find((y) => y.id === Number(sp.from));
  const to = m.years.find((y) => y.id === Number(sp.to));
  const klass = m.classes.find((c) => c.id === classId);
  if (!from || !to || !klass) notFound();
  const overview = (await students.promotionOverview(from.id, to.id)).find((r) => r.classId === classId)!;
  const list = await students.promotionList(from.id, classId, to.id);
  const open = list.filter((s) => s.canPromote);
  const moved = list.filter((s) => s.movedTo || s.status === "left");
  const ordered = [...m.classes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const carry = open.reduce((a, s) => a + s.dues, 0);

  return (
    <div className="space-y-5">
      <PageHeader title={`Promote Class ${klass.name}`} subtitle={`${from.name} → ${to.name}`} actions={<LinkButton href={`/promotion?from=${from.id}&to=${to.id}`}>Back</LinkButton>} />
      {open.length === 0 ? <Empty>Nobody left to promote in Class {klass.name} for {from.name}.</Empty> : (
        <Card title={`${open.length} student(s) to promote`}>
          <ActionForm action={promote} className="space-y-4">
            <input type="hidden" name="from" value={from.id} /><input type="hidden" name="to" value={to.id} /><input type="hidden" name="classId" value={classId} />
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm">“Promote” moves them into
                <select name="toClassId" defaultValue={overview.defaultTo ?? "alumni"}>
                  {ordered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="alumni">Passed out (leaves school)</option>
                </select></label>
              <fieldset className="flex flex-col gap-1 text-sm"><legend>Roll numbers</legend>
                <span className="flex gap-3">
                  <label className="flex items-center gap-1"><input type="radio" name="rollMode" value="keep" defaultChecked />Keep the same</label>
                  <label className="flex items-center gap-1"><input type="radio" name="rollMode" value="clear" />Clear (set new ones later)</label>
                </span></fieldset>
            </div>
            {!overview.targetHasFees && <Notice tone="warn">Class {overview.defaultToName} has no fees set in {to.name} yet. Use “Copy fees” on the Promotion page first, or promoted students won&apos;t be billed.</Notice>}
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>Adm. no.</th><th>Name</th><th>Sec.</th><th>Roll</th><th className="num">Dues to carry</th><th>What to do</th></tr></thead>
                <tbody>{open.map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.admissionNo}<input type="hidden" name="ids" value={s.studentId} /></td>
                    <td>{s.name}</td><td>{s.sectionName ?? "—"}</td><td>{s.rollNo ?? "—"}</td>
                    <td className="num">{s.dues ? <Money p={s.dues} className="text-red-700" /> : "—"}</td>
                    <td><select name={`a_${s.studentId}`} defaultValue="promote" aria-label={`What to do with ${s.name}`}>
                      <option value="promote">Promote</option>
                      <option value="repeat">Repeat Class {klass.name} (failed)</option>
                      <option value="leave">Left school</option>
                      <option value="skip">Not now</option>
                    </select></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-sm text-gray-600">Unpaid dues of <Money p={carry} /> move into {to.name} as an opening balance for students who are promoted or repeat. Passed-out and left students keep their dues on the old bills. A backup is taken first.</p>
            <Submit variant="danger" confirm={`Promote Class ${klass.name} from ${from.name} into ${to.name} as chosen?`}>Promote</Submit>
          </ActionForm>
        </Card>
      )}
      {moved.length > 0 && (
        <Card title="Already done">
          <table className="data">
            <thead><tr><th>Adm. no.</th><th>Name</th><th>Now</th><th /></tr></thead>
            <tbody>{moved.map((s) => (
              <tr key={s.studentId}>
                <td>{s.admissionNo}</td><td>{s.name}</td>
                <td>{s.status === "left" && !s.movedTo ? "Left school" : s.movedTo === "Passed out" ? "Passed out" : `Class ${s.movedTo} in ${to.name}`}</td>
                <td className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {s.movedTo && s.movedTo !== "Passed out" && (
                      <ActionForm action={change.bind(null, s.studentId, from.id, to.id)} className="flex items-center gap-1">
                        <select name="action" defaultValue={s.movedTo === klass.name ? "repeat" : "promote"} aria-label={`Change ${s.name}`}>
                          <option value="promote">Promote to next class</option>
                          <option value="repeat">Repeat Class {klass.name} (failed)</option>
                          <option value="leave">Left school</option>
                        </select>
                        <Submit variant="secondary">Change</Submit>
                      </ActionForm>
                    )}
                    <ActionForm action={undo.bind(null, s.studentId, to.id)}><Submit variant="secondary" confirm={`Undo for ${s.name}?`}>Undo</Submit></ActionForm>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500"><b>Change</b> fixes a student after auto promotion (also when old dues were carried). <b>Undo</b> removes the promotion completely, only while the student has nothing in {to.name}. Both stop working once monthly bills are made in {to.name}.</p>
        </Card>
      )}
    </div>
  );
}
