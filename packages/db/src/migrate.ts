import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "./client";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
await migrate(getDb(), { migrationsFolder: join(here, "../migrations") });
console.log("Migrations applied.");
await getPool().end();
