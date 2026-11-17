import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { schoolProfileSchema, type SchoolProfile } from "@sb/validation";
import { appRoot } from "./env";

/** Read and check a school profile. Relative paths are taken from the project folder. */
export function loadProfile(file: string): SchoolProfile {
  const full = isAbsolute(file) ? file : resolve(appRoot(), file);
  if (!existsSync(full)) throw new Error(`Profile file not found: ${full}`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(full, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    throw new Error(`The profile is not valid JSON (${full}): ${(e as Error).message}`);
  }
  const parsed = schoolProfileSchema.safeParse(json);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(whole file)"}: ${i.message}`);
    throw new Error(`The profile has problems (${full}):\n${lines.join("\n")}`);
  }
  return parsed.data;
}
