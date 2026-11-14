import { z } from "zod";
import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Find the monorepo .env from wherever the process was started.
// Relative paths in it (STORAGE_DIR) are resolved against the .env's folder, so the
// web app and the worker always share one storage folder whatever their cwd.
let baseDir = process.cwd();
for (const p of [".env", "../.env", "../../.env"]) {
  const full = resolve(process.cwd(), p);
  if (existsSync(full)) { config({ path: full }); baseDir = resolve(full, ".."); break; }
}
for (const p of [".", "..", "../.."]) {
  // No .env (e.g. env vars set by the service): anchor to the monorepo root if we can find it.
  const dir = resolve(process.cwd(), p);
  if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) { baseDir = dir; break; }
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
let cached: Env | undefined;

/** Validated environment; the app refuses to start with bad config. */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid environment configuration:\n" + parsed.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n"));
    }
    cached = parsed.data;
  }
  return cached;
}
