import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { env } from "./env";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Either the root db or a transaction — services accept both. */
export type Executor = DB | Tx;

const g = globalThis as unknown as { __sbPool?: pg.Pool; __sbDb?: DB };

export function getPool(): pg.Pool {
  if (!g.__sbPool) g.__sbPool = new pg.Pool({ connectionString: env().DATABASE_URL, max: 10 });
  return g.__sbPool;
}

export function getDb(): DB {
  if (!g.__sbDb) g.__sbDb = drizzle(getPool(), { schema });
  return g.__sbDb;
}
