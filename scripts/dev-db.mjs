// Starts a local PostgreSQL for development without installing it system-wide.
// Data lives in ./.pgdata and persists across restarts.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const databaseDir = resolve(process.env.SB_PGDATA || ".pgdata");
const port = Number(process.env.SB_DB_PORT || 5433);
const bootstrapDb = process.env.SB_BOOTSTRAP_DB || "school_billing";
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "billing",
  password: "billing",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !existsSync(databaseDir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(bootstrapDb);
console.log(`PostgreSQL running on 127.0.0.1:${port} (db: ${bootstrapDb}). Ctrl+C to stop.`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
