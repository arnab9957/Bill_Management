import Link from "next/link";
import { revalidatePath } from "next/cache";
import { fees, formatDate, ops, sessions, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear, nextYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";

async function saveSession(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const reset = fd.get("reset") === "1";
  const r = await run(() => sessions.saveClassSession(u, {
    yearId: Number(fd.get("yearId")), classId: Number(fd.get("classId")),
    startDate: reset ? null : String(fd.get("startDate") || "") || null, endDate: reset ? null : String(fd.get("endDate") || "") || null,
  }), (x) => `Class ${x.className}, ${x.yearName}: ${formatDate(x.startDate)} – ${formatDate(x.endDate)}`);
  revalidatePath("/promotion");
  return r;
}
async function autoPromoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const b = await ops.runBackup("pre_promotion");
  if (!b.ok) return { ok: false, message: `Backup before promotion failed, nothing changed: ${b.error}` };
  const r = await run(() => students.autoPromote(u, Number(fd.get("from"))), (x) => [
    ...x.notes,
    x.done.length ? `Promoted into ${x.toYear.name}: ${x.done.map((d) => `${d.className} → ${d.toName} (${d.students})`).join(", ")}` : "No class was ready",
    x.waiting.length ? `Still running: ${x.waiting.map((w) => `${w.className} (ends ${formatDate(w.endsOn)})`).join(", ")}` : "",
    "Check each class and use Change for students who failed or left.",
  ].filter(Boolean).join(". "));
  revalidatePath("/promotion");
  revalidatePath("/students");
  return r;
}
async function addYear(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => fees.createYear(u, formObject(fd)), "Academic year added");
  revalidatePath("/promotion");
  return r;
}
async function copyFees(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => fees.copyStructures(u, Number(fd.get("from")), Number(fd.get("to")), Number(fd.get("hike") || 0)), (x) => `Copied ${x.copied} fee item(s)`);
  revalidatePath("/promotion");
  return r;
}

export default async function PromotionPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; sy?: string }> }) {
  await requireRole("settings");
  const sp = await searchParams;
  const { years } = await fees.masters();
  const wy = await getWorkingYear();
  const from = years.find((y) => y.id === Number(sp.from)) ?? wy.year;
  const to = years.find((y) => y.id === Number(sp.to)) ?? nextYear(years, from.id);
  const sy = years.find((y) => y.id === Number(sp.sy)) ?? to ?? from;
  const rows = to ? await students.promotionOverview(from.id, to.id) : [];
  const auto = await students.autoPromoteReady(from.id);
  const sess = await sessions.listSessions(sy.id);
  const missingFees = rows.filter((r) => r.waiting > 0 && !r.targetHasFees);
  const q = (o: Record<string, number | undefined>) => new URLSearchParams(Object.entries({ from: from.id, to: to?.id, sy: sy.id, ...o }).filter(([, v]) => v) .map(([k, v]) => [k, String(v)])).toString();

  return (
    <div className="space-y-5">
      <PageHeader title="Promotion" subtitle="Move each class up to the next class, whenever its session ends" actions={
        <form className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm">From<select name="from" defaultValue={from.id}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <label className="flex items-center gap-1 text-sm">into<select name="to" defaultValue={to?.id}>{years.filter((y) => y.startDate > from.startDate).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
          <button className="rounded-md border border-gray-300 bg-white px-3 text-sm">Show</button>
        </form>
      } />

      <Card title="Auto promotion">
        {auto.ready.length > 0 ? (
          <ActionForm action={autoPromoteAction} className="space-y-3">
            <input type="hidden" name="from" value={from.id} />
            <p className="text-sm">
              The session has ended for <b>{auto.ready.map((r) => `${r.className} (${r.waiting})`).join(", ")}</b>.
              One click moves all <b>{auto.students}</b> student(s) up to the next class in <b>{auto.nextYearName}</b>
              {" "}(the top class passes out), keeping section and roll number and carrying unpaid dues.
            </p>
            {!auto.nextYearExists && <p className="text-sm text-gray-600">{auto.nextYearName} doesn&apos;t exist yet: it will be created from {from.name} (same dates a year later, same fees, same class session dates).</p>}
            <Submit confirm={`Promote ${auto.students} student(s) in ${auto.ready.length} class(es) into ${auto.nextYearName}?`}>Auto-promote {auto.ready.length} class{auto.ready.length > 1 ? "es" : ""}</Submit>
            <p className="text-xs text-gray-500">Afterwards open a class below and use <b>Change</b> for anyone who failed or left. A backup is taken first.</p>
          </ActionForm>
        ) : (
          <p className="text-sm text-gray-600">
            Nothing to promote right now from {from.name}.
            {auto.nextEnd ? <> The next session to end is <b>Class {auto.nextEnd.className}</b> on <b>{formatDate(auto.nextEnd.endsOn)}</b>; the button appears here the day after.</> : " Every class has been promoted."}
          </p>
        )}
      </Card>

      {!to && (
        <Card title={`Add the academic year after ${from.name}`}>
          <p className="mb-3 text-sm text-gray-600">Students are promoted into a new academic year. Add it here; each class can then have its own session dates below.</p>
          <ActionForm action={addYear} className="flex flex-wrap items-end gap-2" resetOnSuccess>
            <label className="flex flex-col gap-1 text-sm">Name<input name="name" placeholder="2027-28" className="w-28" required /></label>
            <label className="flex flex-col gap-1 text-sm">Starts<input type="date" name="startDate" aria-label="Year start" required /></label>
            <label className="flex flex-col gap-1 text-sm">Ends<input type="date" name="endDate" data-after="startDate" data-months="12" required /></label>
            <Submit>Add year</Submit><FieldError name="name" /><FieldError name="endDate" />
          </ActionForm>
        </Card>
      )}

      {to && (
        <Card title={`Classes: ${from.name} → ${to.name}`}>
          {missingFees.length > 0 && (
            <Notice tone="warn" className="mb-4">
              No fees are set in {to.name} for: <b>{missingFees.map((r) => r.defaultToName).join(", ")}</b>. Promoted students will not be billed until fees are set.
              <ActionForm action={copyFees} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="from" value={from.id} /><input type="hidden" name="to" value={to.id} />
                <label className="flex items-center gap-1 text-sm">Copy all fees from {from.name}, increase by %<input name="hike" type="number" step="0.1" defaultValue={0} className="w-20" /></label>
                <Submit variant="secondary">Copy fees</Submit>
              </ActionForm>
            </Notice>
          )}
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Class</th><th>Session in {from.name}</th><th className="num">To promote</th><th className="num">Done</th><th>Moves to</th><th>Next session</th><th /></tr></thead>
              <tbody>{rows.map((r) => {
                const ended = r.fromSession.endDate < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={r.classId}>
                    <td className="font-medium">{r.className}</td>
                    <td>{formatDate(r.fromSession.startDate)} – {formatDate(r.fromSession.endDate)}{ended ? <span className="ml-1 text-xs text-green-700">ended</span> : null}</td>
                    <td className="num">{r.waiting || "—"}</td>
                    <td className="num">{r.done || "—"}</td>
                    <td>{r.defaultToName}{!r.targetHasFees && r.waiting > 0 ? <span className="ml-1 text-xs text-amber-700">no fees</span> : null}</td>
                    <td>{r.toSession ? `${formatDate(r.toSession.startDate)} – ${formatDate(r.toSession.endDate)}` : "—"}</td>
                    <td className="text-right">{(r.waiting > 0 || r.done > 0) && <Link className="text-brand-700 hover:underline" href={`/promotion/${r.classId}?from=${from.id}&to=${to.id}`}>{r.waiting > 0 ? "Promote →" : "View"}</Link>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">Classes can be promoted in any order and at different times. Unpaid dues move into the new year as an opening balance. A backup is taken before each promotion.</p>
        </Card>
      )}

      <Card title={`Session dates in ${sy.name}`} actions={
        <div className="flex flex-wrap gap-1 text-sm">{years.map((y) => <Link key={y.id} href={`/promotion?${q({ sy: y.id })}`} className={`rounded px-2 py-0.5 ${y.id === sy.id ? "bg-gray-900 text-white" : "text-brand-700 hover:underline"}`}>{y.name}</Link>)}</div>
      }>
        <p className="mb-3 text-sm text-gray-600">
          Each class uses the academic year&apos;s dates (<b>{formatDate(sy.startDate)} – {formatDate(sy.endDate)}</b>) unless you give it its own.
          A session is at most 12 months, and one class&apos;s sessions can&apos;t overlap. Bills follow these dates.
        </p>
        <div className="space-y-2">{sess.map((s) => (
          <ActionForm key={s.classId} action={saveSession} className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2">
            <input type="hidden" name="yearId" value={sy.id} /><input type="hidden" name="classId" value={s.classId} />
            <span className="w-24 font-medium">{s.className}</span>
            <input type="date" name="startDate" defaultValue={s.startDate} aria-label={`${s.className} session start`} required />
            <span className="text-gray-400">to</span>
            <input type="date" name="endDate" defaultValue={s.endDate} aria-label={`${s.className} session end`} data-after="startDate" data-months="12" required />
            <Submit variant="secondary">Save</Submit>
            {s.custom ? <><span className="text-xs text-brand-700">own dates</span><Submit variant="secondary" name="reset" value="1">Use year&apos;s dates</Submit></> : <span className="text-xs text-gray-400">year&apos;s dates</span>}
          </ActionForm>
        ))}</div>
      </Card>
    </div>
  );
}
