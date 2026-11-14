import "server-only";
import PgBoss from "pg-boss";
import { env } from "@sb/db";

const g = globalThis as unknown as { __sbBoss?: Promise<PgBoss> };

/** Producer-only pg-boss client: the web app never runs jobs, it only nudges the worker. */
function boss(): Promise<PgBoss> {
  g.__sbBoss ??= (async () => {
    const b = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss", supervise: false, schedule: false, migrate: false, max: 2 });
    b.on("error", (e) => console.error("pg-boss", e));
    await b.start();
    return b;
  })().catch((e) => { g.__sbBoss = undefined; throw e; });
  return g.__sbBoss;
}

/** Ask the worker to send queued messages now instead of at its next 2-minute run. */
export async function wakeDispatcher(): Promise<boolean> {
  try {
    await (await boss()).send("dispatchOutbox", {});
    return true;
  } catch (e) {
    console.error("Could not reach the worker queue:", e);
    return false; // the message is still queued; the worker's schedule will send it
  }
}
