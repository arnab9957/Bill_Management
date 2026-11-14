import { billing, notifications, ops, accounts, getProviderConfig, today, periodOf } from "@sb/core";
import { env } from "@sb/db";
import { buildAdapters, isOnline } from "@sb/notifications";
import type { Logger } from "pino";

/** Every job is idempotent: running it twice creates nothing new. */
export const jobs = {
  /** 1st of the month: bill every active student for the month. */
  async billRun(log: Logger, data?: { period?: string }) {
    const period = data?.period ?? periodOf(today());
    const r = await billing.generateInvoices({ period, dryRun: false });
    log.info({ period, created: r.created.length, skipped: r.skipped.length, total: r.totalNet }, "bill run finished");
  },
  /** Daily: refresh overdue status and add late fees. */
  async lateFee(log: Logger) {
    const r = await billing.applyLateFees(today());
    log.info(r, "late fees applied");
  },
  /** Daily 08:00: queue upcoming / due-today / overdue reminders. */
  async dueScan(log: Logger) {
    const n = await notifications.queueDueReminders(today());
    log.info({ queued: n }, "due reminders queued");
  },
  /** Every 2 minutes: send what is queued, when online and inside sending hours. */
  async dispatchOutbox(log: Logger) {
    const cfg = await getProviderConfig();
    const { adapters, needsInternet } = buildAdapters(cfg, env().STORAGE_DIR);
    const r = await notifications.dispatchOutbox({ adapters, isOnline: needsInternet ? () => isOnline() : async () => true });
    if (r.picked || r.cancelled || r.skippedReason === "offline") log.info(r, "dispatch");
  },
  async backup(log: Logger) {
    const r = await ops.runBackup("nightly");
    if (r.ok) log.info({ file: r.file, size: r.size }, "backup ok");
    else log.error({ error: r.error }, "BACKUP FAILED");
  },
  async integrityCheck(log: Logger) {
    const r = await ops.integrityCheck();
    if (r.problems.length) log.warn({ problems: r.problems }, "integrity problems found");
    else log.info("integrity check clean");
  },
  async housekeeping() {
    await accounts.purgeExpiredSessions();
  },
};
export type JobName = keyof typeof jobs;
