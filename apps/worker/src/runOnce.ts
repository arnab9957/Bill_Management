/** Run one job immediately: pnpm --filter @sb/worker run-job dueScan  (or billRun 2026-07) */
import pino from "pino";
import { getPool } from "@sb/db";
import { jobs, type JobName } from "./jobs";

const [name, arg] = process.argv.slice(2) as [JobName | undefined, string | undefined];
if (!name || !(name in jobs)) {
  console.error(`Usage: run-job <${Object.keys(jobs).join("|")}> [period]`);
  process.exit(1);
}
await jobs[name](pino(), (arg ? { period: arg } : undefined) as never);
await getPool().end();
