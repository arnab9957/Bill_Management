import { z } from "zod";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

const root = findRoot(process.cwd());
const instance = process.env.SB_INSTANCE;
let baseDir = root;
let envError: Error | undefined;

if (instance && instance !== "default") {
  const full = resolve(root, "instances", instance, ".env");
  if (existsSync(full)) { config({ path: full }); baseDir = dirname(full); }
  else envError = new Error(`Configuration for institute '${instance}' was not found: ${full}`);
} else {
  for (const p of [".env", "../.env", "../../.env"]) {
    const full = resolve(process.cwd(), p);
    if (existsSync(full)) { config({ path: full }); baseDir = dirname(full); break; }
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  STORAGE_DIR: z.string().default("./storage").transform((d) => resolve(baseDir, d)),
  PG_DUMP_PATH: z.string().default("pg_dump"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;
/** Folder holding the monorepo (where .env / pnpm-workspace.yaml live). */
export const appRoot = () => baseDir;
export function instanceCode(): string {
  const raw = (process.env.SB_INSTANCE || "default").trim().toLowerCase();
  return raw !== "default" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : "school_billing";
}
let cached: Env | undefined;

/** Validated environment; the app refuses to start with bad config. */
export function env(): Env {
  if (envError) throw envError;
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid environment configuration:\n" + parsed.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n"));
    }
    cached = parsed.data;
  }
  return cached;
}
