import { z } from "zod";
import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Find the monorepo .env from wherever the process was started.
for (const p of [".env", "../.env", "../../.env"]) {
  const full = resolve(process.cwd(), p);
  if (existsSync(full)) { config({ path: full }); break; }
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  STORAGE_DIR: z.string().default("./storage"),
  PG_DUMP_PATH: z.string().default("pg_dump"),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;
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
