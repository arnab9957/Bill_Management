import { revalidatePath } from "next/cache";
import { ops } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Notice, PageHeader, Stat } from "@/components/ui";

async function backupNow(): Promise<ActionState> {
  "use server";
  await requireRole("settings");
  const r = await ops.runBackup("manual");
  revalidatePath("/settings/health");
  return r.ok ? { ok: true, message: `Backup written: ${r.file}` } : { ok: false, message: `Backup failed: ${r.error}` };
}
async function integrity(): Promise<ActionState> {
  "use server";
  await requireRole("settings");
  const r = await ops.integrityCheck();
  revalidatePath("/settings/health");
  return r.problems.length ? { ok: false, message: `${r.problems.length} problem(s): ${r.problems.slice(0, 5).join(" | ")}` } : { ok: true, message: "All checks passed" };
}
async function usbDone() {
  "use server";
  const u = await requireRole("settings");
  await ops.markUsbBackupDone(u);
  revalidatePath("/settings/health");
}
async function restore(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  if (fd.get("confirm") !== "RESTORE") return { ok: false, message: 'Type RESTORE to confirm' };
  return run(() => ops.restoreBackup(u, String(fd.get("file"))), "Restored. Restart the web and worker services now.");
}

export default async function Health() {
  await requireRole("settings");
  const [h, backups] = await Promise.all([ops.health(), ops.listBackups()]);
  if (!h.dbOk) return <Notice tone="error">Database is down: {h.dbError}</Notice>;
  return (
    <div className="space-y-4">
      <PageHeader title="Backups & system health" actions={<LinkButton href="/settings">Back</LinkButton>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Database" value="Up" tone="green" />
        <Stat label="Last good backup" value={h.lastBackup ? h.lastBackup.at.toLocaleDateString("en-IN") : "Never"} tone={h.lastBackup && Date.now() - h.lastBackup.at.getTime() < 36 * 3600_000 ? "green" : "red"}
          sub={h.lastBackupAttempt && !h.lastBackupAttempt.ok ? "Last attempt FAILED" : h.lastBackup?.at.toLocaleTimeString("en-IN")} />
        <Stat label="Message queue" value={h.outbox?.queued ?? 0} sub={`${h.outbox?.failed ?? 0} failed`} tone={h.outbox?.failed ? "red" : undefined} />
        <Stat label="Disk free" value={h.disk ? `${h.disk.freeGb} GB` : "?"} sub={h.disk ? `of ${h.disk.totalGb} GB` : undefined} tone={h.disk && h.disk.freeGb < 5 ? "red" : undefined} />
      </div>
      {h.usbBackupOverdue && <Notice tone="warn">Copy the latest backup to the external USB drive and store it away from the server. <form className="inline" action={usbDone}><button className="ml-2 underline">I have done it today</button></form></Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Actions">
          <div className="space-y-3">
            <ActionForm action={backupNow}><Submit>Back up now</Submit></ActionForm>
            <ActionForm action={integrity}><Submit variant="secondary">Run integrity check</Submit></ActionForm>
          </div>
          <p className="mt-3 text-xs text-gray-500">Nightly backups run at 23:00 (30 daily + 12 monthly kept). Integrity check recomputes balances and checks bill/receipt numbers have no gaps.</p>
        </Card>
        <Card title="Integrity issues">
          {h.issues?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-red-800">{h.issues.map((i) => <li key={i.id}>{i.detail}</li>)}</ul> : <p className="text-sm text-green-700">No open issues.</p>}
        </Card>
      </div>
      <Card title="Backups">
        <table className="data">
          <thead><tr><th>When</th><th>Kind</th><th>File</th><th className="num">Size</th><th>Result</th></tr></thead>
          <tbody>{backups.map((b) => (
            <tr key={b.id}><td className="whitespace-nowrap">{b.at.toLocaleString("en-IN")}</td><td>{b.kind}</td><td className="font-mono text-xs">{b.filePath}</td>
              <td className="num">{b.sizeBytes ? `${(b.sizeBytes / 1e6).toFixed(1)} MB` : ""}</td><td>{b.ok ? <Badge>valid</Badge> : <span className="text-xs text-red-700">{b.error}</span>}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="Restore from backup (danger)">
        <Notice tone="error">Restoring replaces ALL current data with the backup. A safety backup is taken first. Stop all counters before restoring.</Notice>
        <ActionForm action={restore} className="mt-3 flex flex-wrap gap-2">
          <select name="file" className="w-full sm:max-w-xl">{backups.filter((b) => b.ok).map((b) => <option key={b.id} value={b.filePath}>{b.at.toLocaleString("en-IN")} — {b.kind}</option>)}</select>
          <input name="confirm" placeholder="Type RESTORE" className="w-36" />
          <Submit variant="danger" confirm="Really replace all data with this backup?">Restore</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
