import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verify } from "@node-rs/argon2";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the real setup command (packages/db/src/setup.ts) against a throw-away database.
// Enabled with RUN_DB_TESTS=1, like the other database tests.
const here = dirname(fileURLToPath(import.meta.url));
const dbDir = resolve(here, "../../db");
const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://billing:billing@127.0.0.1:5433";
const DB = "school_billing_setup_test";
const DB_URL = `${BASE}/${DB}`;
const run = process.env.RUN_DB_TESTS === "1";

function newSchool(profile: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/setup.ts", "--profile", profile], {
    cwd: dbDir,
    env: { ...process.env, DATABASE_URL: DB_URL, APP_SECRET: process.env.APP_SECRET ?? "test-secret-test-secret-test-secret-123" },
    encoding: "utf8",
  });
}

describe.skipIf(!run)("setting up a new school", () => {
  const db = new pg.Client({ connectionString: DB_URL });

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: `${BASE}/postgres` });
    await admin.connect();
    await admin.query(`drop database if exists ${DB} with (force)`);
    await admin.query(`create database ${DB}`);
    await admin.end();
    await db.connect();
  }, 60_000);
  afterAll(async () => {
    await db.end();
  });

  it("creates the school from the example profile and prints a one-time admin password", async () => {
    const r = newSchool("profiles/examples/parul-indobala.json");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('School set up from "Parul Indobala');
    const m = /Initial sign-in:\s+(\S+) \/ (\S+)/.exec(r.stdout);
    expect(m).not.toBeNull();
    const [, user, password] = m!;

    const settings = (await db.query("select name, receipt_prefix, receipt_include_year, receipt_digits, udise_code from school_settings")).rows[0];
    expect(settings).toMatchObject({ name: "Parul Indobala Sishu Shiksha Sadan", receipt_prefix: "C", receipt_include_year: false, receipt_digits: 1, udise_code: "19122200107" });

    const series = (await db.query("select key, last_value, start_value from number_series")).rows;
    expect(series).toEqual([{ key: "RECEIPT:C", last_value: 6434, start_value: 6435 }]);

    expect((await db.query("select count(*)::int as n from fee_head where receipt_order is not null")).rows[0].n).toBe(17);
    // 17 from the profile + Transport, Opening balance and Cheque bounce, which the software always needs
    expect((await db.query("select count(*)::int as n from fee_head")).rows[0].n).toBe(20);

    const u = (await db.query("select username, password_hash, must_change_password from app_user")).rows[0];
    expect(u.username).toBe(user);
    expect(u.must_change_password).toBe(true);
    expect(await verify(u.password_hash, password!)).toBe(true);
    expect(await verify(u.password_hash, "not-the-password")).toBe(false);
  }, 60_000);

  it("refuses to run again on a database that already has school data", () => {
    const r = newSchool("profiles/examples/parul-indobala.json");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("already has school data");
  });

  it("lists every problem in a broken profile and writes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "school-profile-"));
    const file = join(dir, "broken.json");
    writeFileSync(file, JSON.stringify({
      profileName: "Broken", school: { name: "" },
      academicYear: { name: "2026-27", startDate: "2027-04-01", endDate: "2026-03-31" }, receipts: { prefix: "A/B" },
    }));
    const r = newSchool(file);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("School name is required");
    expect(r.stderr).toContain("End date must be after the start date");
  });
});
