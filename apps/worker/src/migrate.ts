/** Production migration runner (bundled): node dist/migrate.js  — reads ../migrations by default. */
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "@sb/db";

const folder = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), "../migrations");
await migrate(getDb(), { migrationsFolder: folder });
console.log(`Migrations applied from ${folder}`);
await getPool().end();
