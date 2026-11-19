// Drop and re-create a TEST database (name must contain "test"). Used by test-school.cmd.
import { createRequire } from "node:module";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2] ?? "";
if (!/^[a-z_]*test[a-z_]*$/.test(name)) {
  console.error(`Refusing: "${name}" is not a test database name.`);
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = createRequire(join(root, "packages/db/package.json"))("pg");
const c = new Client({ connectionString: "postgres://billing:billing@127.0.0.1:5433/postgres" });
await c.connect();
await c.query(`drop database if exists ${name} with (force)`);
await c.query(`create database ${name}`);
await c.end();
console.log(`Fresh database ${name} ready.`);
