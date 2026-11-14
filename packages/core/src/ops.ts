/** Operations: nightly integrity check, backups, health. */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync, unlinkSync, statfsSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, env, backupLog, integrityIssues, numberSeries, notificationOutbox, schoolSettings } from "@sb/db";
import { getSettings, audit, clearSettingsCache, type Actor } from "./common";

// ---------------------------------------------------------------- integrity
export async function integrityCheck(): Promise<{ checks: number; problems: string[] }> {
  const db = getDb();
  const problems: string[] = [];
  const q = async (name: string, query: ReturnType<typeof sql>, describe: (r: Record<string, unknown>) => string) => {
    const res = await db.execute(query);
    for (const r of res.rows as Record<string, unknown>[]) problems.push(`[${name}] ${describe(r)}`);
  };
  await q("invoice-totals", sql`
    select i.invoice_no, i.net, i.paid, coalesce(sum(l.net),0) as lnet, coalesce(sum(l.paid),0) as lpaid
    from invoice i left join invoice_line l on l.invoice_id = i.id
    group by i.id having i.net <> coalesce(sum(l.net),0) or i.paid <> coalesce(sum(l.paid),0)`,
    (r) => `${r.invoice_no}: header net/paid ${r.net}/${r.paid} ≠ lines ${r.lnet}/${r.lpaid}`);
  await q("line-allocations", sql`
    select l.id, l.paid, coalesce(sum(a.amount) filter (where a.reversed_at is null),0) as alloc
    from invoice_line l left join payment_allocation a on a.invoice_line_id = l.id
    group by l.id having l.paid <> coalesce(sum(a.amount) filter (where a.reversed_at is null),0)`,
    (r) => `invoice line ${r.id}: paid ${r.paid} ≠ allocations ${r.alloc}`);
  await q("payment-balance", sql`
    select p.receipt_no, p.amount, p.unallocated, coalesce(sum(a.amount) filter (where a.reversed_at is null),0) as alloc
    from payment p left join payment_allocation a on a.payment_id = p.id
    where p.status = 'valid'
      -- refunds consume unallocated money, so refunded students are checked via wallet-cache instead
      and not exists (select 1 from refund r where r.student_id = p.student_id)
    group by p.id, p.amount, p.unallocated
    having p.amount - p.unallocated <> coalesce(sum(a.amount) filter (where a.reversed_at is null),0)`,
    (r) => `${r.receipt_no}: amount ${r.amount} − unallocated ${r.unallocated} ≠ allocated ${r.alloc}`);
  await q("wallet-cache", sql`
    select w.student_id, w.balance, coalesce((select sum(unallocated) from payment p where p.student_id = w.student_id and p.status='valid'),0) as real
    from student_wallet w where w.balance <> coalesce((select sum(unallocated) from payment p where p.student_id = w.student_id and p.status='valid'),0)`,
    (r) => `student ${r.student_id}: wallet ${r.balance} ≠ ${r.real}`);
  // Gap-free numbering: every value 1..last must exist for receipts and invoices.
  const series = await db.select().from(numberSeries);
  for (const s of series) {
    const [kind, year] = s.key.split(":");
    const table = kind === "RECEIPT" ? "payment" : kind === "INVOICE" ? "invoice" : kind === "CREDIT_NOTE" ? "credit_note" : null;
    const col = kind === "RECEIPT" ? "receipt_no" : kind === "INVOICE" ? "invoice_no" : "credit_note_no";
    if (!table || !year) continue;
    const res = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where ${sql.identifier(col)} like ${"%/" + year + "/%"}`);
    const n = Number((res.rows[0] as { n: number }).n);
    if (n !== s.lastValue) problems.push(`[numbering] ${s.key}: counter at ${s.lastValue} but ${n} documents exist`);
  }
  await db.update(integrityIssues).set({ resolved: true }).where(eq(integrityIssues.resolved, false));
  if (problems.length) await db.insert(integrityIssues).values(problems.map((p) => ({ checkName: p.slice(1, p.indexOf("]")), detail: p })));
  return { checks: 5, problems };
}

// ---------------------------------------------------------------- backups
export function backupDir(settingsPath?: string | null) {
  const dir = resolve(settingsPath || join(env().STORAGE_DIR, "backups"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function run(cmd: string, args: string[], envVars: Record<string, string>): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...envVars }, windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(err || `${cmd} exited with ${code}`))));
  });
}

const pgEnv = () => {
  const u = new URL(env().DATABASE_URL);
  return { PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: u.pathname.slice(1) };
};

export async function runBackup(kind: "nightly" | "manual" | "pre_update" | "pre_promotion" = "nightly") {
  const db = getDb();
  const s = await getSettings(db);
  const dir = backupDir(s.backupPath);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const file = join(dir, `school_billing_${stamp}_${kind}.dump`);
  try {
    await run(env().PG_DUMP_PATH, ["-Fc", "-f", file], pgEnv());
    const size = statSync(file).size;
    await db.insert(backupLog).values({ kind, filePath: file, sizeBytes: size, ok: true });
    pruneBackups(dir);
    return { ok: true as const, file, size };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(backupLog).values({ kind, filePath: file, ok: false, error });
    return { ok: false as const, error };
  }
}

/** Keep 30 daily + one per month for 12 months; manual/pre-* backups are kept 90 days. */
export function pruneBackups(dir: string) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".dump")).map((f) => ({ f, t: statSync(join(dir, f)).mtime }));
  const now = Date.now();
  const keepMonthly = new Set<string>();
  for (const x of files.sort((a, b) => a.t.getTime() - b.t.getTime())) {
    const age = (now - x.t.getTime()) / 86_400_000;
    const month = x.t.toISOString().slice(0, 7);
    if (!x.f.includes("_nightly")) { if (age > 90) unlinkSync(join(dir, x.f)); continue; }
    if (age <= 30) continue;
    if (age <= 366 && !keepMonthly.has(month)) { keepMonthly.add(month); continue; }
    unlinkSync(join(dir, x.f));
  }
}

export async function listBackups() {
  return getDb().select().from(backupLog).orderBy(desc(backupLog.id)).limit(60);
}

/** Restore a dump over the current database. Takes a safety backup first. */
export async function restoreBackup(actor: Actor, file: string) {
  if (!existsSync(file)) throw new Error("Backup file not found");
  const safety = await runBackup("manual");
  if (!safety.ok) throw new Error(`Safety backup failed, restore aborted: ${safety.error}`);
  const restoreBin = env().PG_DUMP_PATH.replace(/pg_dump(\.exe)?$/i, (_m, ext) => `pg_restore${ext ?? ""}`);
  await run(restoreBin, ["--clean", "--if-exists", "--no-owner", "-d", pgEnv().PGDATABASE, file], pgEnv());
  await audit(getDb(), actor, "restore", "backup", null, null, { file, safety: safety.file });
}

export async function markUsbBackupDone(actor: Actor) {
  const db = getDb();
  await db.update(schoolSettings).set({ usbBackupLastAt: new Date() }).where(eq(schoolSettings.id, 1));
  clearSettingsCache();
  await audit(db, actor, "usb_backup", "school_settings", 1);
}

// ---------------------------------------------------------------- health
export async function health() {
  const db = getDb();
  let dbOk = true, dbError: string | undefined;
  try { await db.execute(sql`select 1`); } catch (e) { dbOk = false; dbError = String(e); }
  if (!dbOk) return { dbOk, dbError };
  const s = await getSettings(db);
  const [last] = await db.select().from(backupLog).where(eq(backupLog.ok, true)).orderBy(desc(backupLog.id)).limit(1);
  const [lastFail] = await db.select().from(backupLog).orderBy(desc(backupLog.id)).limit(1);
  const outbox = await db.select({ status: notificationOutbox.status, n: sql<number>`count(*)::int` }).from(notificationOutbox).groupBy(notificationOutbox.status);
  const issues = await db.select().from(integrityIssues).where(eq(integrityIssues.resolved, false)).limit(50);
  let disk: { freeGb: number; totalGb: number } | undefined;
  try {
    const st = statfsSync(dirname(backupDir(s.backupPath)));
    disk = { freeGb: +(st.bavail * st.bsize / 1e9).toFixed(1), totalGb: +(st.blocks * st.bsize / 1e9).toFixed(1) };
  } catch { /* not supported */ }
  const usbDays = s.usbBackupLastAt ? Math.floor((Date.now() - s.usbBackupLastAt.getTime()) / 86_400_000) : null;
  return {
    dbOk, lastBackup: last ?? null, lastBackupAttempt: lastFail ?? null,
    outbox: Object.fromEntries(outbox.map((o) => [o.status, o.n])) as Record<string, number>,
    issues, disk, usbBackupOverdue: usbDays === null || usbDays > 7, usbDays,
  };
}
