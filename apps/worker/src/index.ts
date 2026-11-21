/**
 * Background worker: owns every timer in the system (the web server never runs
 * scheduled work). Uses pg-boss, so the queue lives in PostgreSQL — no Redis.
 */
import PgBoss from "pg-boss";
import pino from "pino";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { env } from "@sb/db";
import { jobs, type JobName } from "./jobs";

const cfg = env(); // refuses to start with bad config
const logDir = join(cfg.STORAGE_DIR, "logs");
mkdirSync(logDir, { recursive: true });
const log = pino(
  { level: "info", base: { app: "worker" } },
  pino.transport({
    targets: [
      { target: "pino-roll", options: { file: join(logDir, "worker"), frequency: "daily", mkdir: true, limit: { count: 30 } } },
      { target: "pino/file", options: { destination: 1 } },
    ],
  }),
);

const TZ = "Asia/Kolkata";
const schedule: { name: JobName; cron: string }[] = [
  { name: "autoPromote", cron: "30 5 * * *" },   // 05:30 daily, before the bill run
  { name: "billRun", cron: "0 6 1 * *" },        // 06:00 on the 1st
  { name: "lateFee", cron: "30 7 * * *" },       // 07:30 daily
  { name: "dueScan", cron: "0 8 * * *" },        // 08:00 daily
  { name: "dispatchOutbox", cron: "*/2 * * * *" }, // every 2 minutes
  { name: "backup", cron: "0 23 * * *" },        // 23:00 nightly
  { name: "integrityCheck", cron: "30 23 * * *" },
  { name: "housekeeping", cron: "0 * * * *" },
];

const boss = new PgBoss({ connectionString: cfg.DATABASE_URL, schema: "pgboss" });
boss.on("error", (e) => log.error(e, "pg-boss error"));
await boss.start();

for (const { name, cron } of schedule) {
  // singleton policy: never two copies of the same job running at once
  await boss.createQueue(name, { name, policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 60 * 30 });
  await boss.schedule(name, cron, {}, { tz: TZ });
  await boss.work(name, async (batch) => {
    for (const job of batch) {
      const started = Date.now();
      try {
        await jobs[name](log.child({ job: name }), job.data as never);
      } catch (e) {
        log.error({ err: e, job: name }, "job failed");
        throw e; // pg-boss retries with backoff
      } finally {
        if (name !== "dispatchOutbox") log.info({ job: name, ms: Date.now() - started }, "job done");
      }
    }
  });
}
log.info({ jobs: schedule.map((s) => `${s.name} @ ${s.cron}`) }, "worker started");
// Catch up at start-up: a PC that was off when a session ended promotes those classes now.
await boss.send("autoPromote", {});

const stop = async () => {
  log.info("worker stopping");
  await boss.stop({ graceful: true, timeout: 20_000 });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
