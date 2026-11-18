import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import {
  ROOT,
  assertCode,
  findFreePort,
  instancePaths,
  listInstances,
  readEnvFile,
  resolveProfile,
  withDatabase,
} from "./instance.mjs";

const require = createRequire(join(ROOT, "packages/db/package.json"));
const { Client } = require("pg");

const { values } = parseArgs({
  options: {
    code: { type: "string" },
    name: { type: "string" },
    profile: { type: "string" },
    port: { type: "string" },
    "db-name": { type: "string" },
  },
  strict: true,
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!values.code) fail("Usage: new-institute.mjs --code <slug> --name <display name> --profile <profile.json> [--port 3000] [--db-name sb_code]");
assertCode(values.code);
if (listInstances().includes(values.code)) fail(`Institute '${values.code}' already exists.`);
if (!values.profile) fail("A profile file is required.");

const code = values.code;
const name = values.name || code;
const dbName = values["db-name"] || `sb_${code.replace(/-/g, "_")}`;
if (!/^[a-z][a-z0-9_]*$/.test(dbName)) fail(`Invalid database name: ${dbName}`);
const profileFile = resolveProfile(values.profile);
const paths = instancePaths(code);
if (existsSync(paths.dir)) fail(`Folder already exists: ${paths.dir}`);

const rootEnvFile = join(ROOT, ".env");
const rootEnv = readEnvFile(rootEnvFile);
const exampleEnv = readEnvFile(join(ROOT, ".env.example"));
const baseUrl = rootEnv.DATABASE_URL || exampleEnv.DATABASE_URL;
if (!baseUrl) fail("DATABASE_URL is missing from .env");
const adminUrl = withDatabase(baseUrl, "postgres");
const databaseUrl = withDatabase(baseUrl, dbName);

const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const exists = await client.query("select 1 from pg_database where datname = $1", [dbName]);
  if (exists.rowCount === 0) {
    const safeName = `"${dbName.replace(/"/g, '""')}"`;
    await client.query(`create database ${safeName}`);
    console.log(`Created database ${dbName}.`);
  } else {
    console.log(`Database ${dbName} already exists; reusing it.`);
  }
} catch (e) {
  fail(`Could not create database ${dbName}: ${e.message}`);
} finally {
  await client.end().catch(() => {});
}

const port = Number(values.port || (await findFreePort(3000)));
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`Invalid web port: ${values.port}`);
const secret = randomBytes(32).toString("base64url");
const storage = paths.storageDir.replace(/\\/g, "/");
const pgDump = rootEnv.PG_DUMP_PATH || exampleEnv.PG_DUMP_PATH || "pg_dump";
const idle = rootEnv.SESSION_IDLE_MINUTES || exampleEnv.SESSION_IDLE_MINUTES || "30";

mkdirSync(join(paths.storageDir, "branding"), { recursive: true });
mkdirSync(join(paths.storageDir, "photos"), { recursive: true });
mkdirSync(join(paths.storageDir, "backups"), { recursive: true });
mkdirSync(join(paths.storageDir, "logs"), { recursive: true });
copyFileSync(profileFile, paths.profileFile);

writeFileSync(paths.configFile, JSON.stringify({
  code,
  name,
  dbName,
  webPort: port,
  host: "127.0.0.1",
  profile: profileFile,
  serviceWeb: `SchoolBillingWeb-${code}`,
  serviceWorker: `SchoolBillingWorker-${code}`,
  firewallRule: `School Billing (${code})`,
  createdAt: new Date().toISOString(),
}, null, 2) + "\n");
writeFileSync(paths.envFile, [
  `DATABASE_URL=${databaseUrl}`,
  `APP_SECRET=${secret}`,
  `STORAGE_DIR=${storage}`,
  `PG_DUMP_PATH=${pgDump}`,
  `SESSION_IDLE_MINUTES=${idle}`,
  "NEXT_TELEMETRY_DISABLED=1",
  `SB_HOST=127.0.0.1`,
  `SB_PORT=${port}`,
  "",
].join("\n"));

console.log(`\nInstitute: ${name} (${code})`);
console.log(`Config:    ${paths.configFile}`);
console.log(`Storage:   ${paths.storageDir}`);
console.log(`Web:       http://127.0.0.1:${port}\n`);

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const profileArg = process.platform === "win32" ? `"${paths.profileFile}"` : paths.profileFile;
const result = spawnSync(pnpm, ["new-school", "--profile", profileArg], {
  cwd: ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, SB_INSTANCE: code },
});
if (result.error) fail(`Provisioning could not start: ${result.error.message}`);
if (result.status !== 0) {
  fail(`Provisioning did not finish. After fixing the problem, run:\n  pnpm new-school --profile "${paths.profileFile}" with SB_INSTANCE=${code}`);
}
console.log(`\nDone. Start it with:  start-instance.cmd --instance ${code}`);
