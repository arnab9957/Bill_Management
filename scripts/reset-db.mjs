// Drop and recreate the school database so setup.cmd can run fresh.
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvFile, dbParts, withDatabase } from "./instance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env");
const env = readEnvFile(envFile);
const databaseUrl = env.DATABASE_URL || "postgres://billing:billing@127.0.0.1:5433/school_billing";

const parts = dbParts(databaseUrl);
const dbName = parts.db;

if (!dbName || dbName === "postgres") {
  console.error(`Refusing to drop administrative database: "${dbName}"`);
  process.exit(1);
}

const adminUrl = withDatabase(databaseUrl, "postgres");
const require = createRequire(join(root, "packages/db/package.json"));
const { Client } = require("pg");

const client = new Client({ connectionString: adminUrl });
try {
  await client.connect();
  console.log(`Dropping database "${dbName}"...`);
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  console.log(`Creating fresh empty database "${dbName}"...`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Database "${dbName}" has been successfully reset.`);
} catch (err) {
  console.error("Failed to reset database:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
