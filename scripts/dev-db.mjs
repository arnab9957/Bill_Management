// Starts a local PostgreSQL for development without installing it system-wide.
// Data lives in ./.pgdata and persists across restarts.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const databaseDir = resolve(".pgdata");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "billing",
  password: "billing",
  port: 5433,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

const fresh = !existsSync(databaseDir);
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("school_billing");
console.log("PostgreSQL running on 127.0.0.1:5433 (db: school_billing). Ctrl+C to stop.");

const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
