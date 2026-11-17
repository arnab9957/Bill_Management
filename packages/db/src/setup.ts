import { randomInt } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, getPool } from "./client";
import { loadProfile } from "./profile";
import { provisionSchool } from "./provision";

/**
 * Set up a NEW school: create the tables, load the school's profile and create the first admin.
 *   pnpm new-school --profile profiles/local/<school>.json [--admin-username admin] [--admin-password ...]
 * Refuses to run on a database that already has users, students, bills or payments.
 * Exit codes: 0 = done, 1 = a problem with the arguments or the profile, 2 = the database is not empty.
 */
function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no look-alike characters
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    "admin-username": { type: "string", default: "admin" },
    "admin-password": { type: "string" },
  },
});

if (!values.profile) fail("Usage: pnpm new-school --profile profiles/local/<school>.json [--admin-username admin]", 1);

let profile: ReturnType<typeof loadProfile>;
try {
  profile = loadProfile(values.profile);
} catch (e) {
  fail((e as Error).message, 1);
}

const password = values["admin-password"] ?? generatePassword();
if (password.length < 8) fail("The admin password must be at least 8 characters.", 1);

const db = getDb();
const here = dirname(fileURLToPath(import.meta.url));
await migrate(db, { migrationsFolder: join(here, "../migrations") });

const counts = (await db.execute(sql`
  select (select count(*) from app_user)::int as users, (select count(*) from student)::int as students,
         (select count(*) from invoice)::int as bills, (select count(*) from payment)::int as payments`)).rows[0] as Record<string, number>;
if (Object.values(counts).some((n) => n > 0)) {
  await getPool().end();
  fail("This database already has school data (users, students, bills or payments), so setup will not run.\n"
    + "To change settings, use Settings in the app. A new school needs an empty database.", 2);
}

const r = await provisionSchool(db, profile, { overwrite: true, adminUsername: values["admin-username"]!, adminPassword: password, adminFullName: "Administrator" });
await getPool().end();

const printedRows = profile.feeHeads.filter((h) => h.receiptOrder != null).length;
console.log(`School set up from "${profile.profileName}"`);
console.log(`  Academic year:  ${r.year} (current)`);
console.log(`  Classes:        ${r.classes}${r.classes === 0 ? "  (add them under Settings)" : ""}`);
console.log(`  Fee heads:      ${r.feeHeads} (${printedRows} printed as fixed receipt rows)`);
console.log(`  Next receipt:   ${r.receiptNext}`);
console.log("");
console.log(`Initial sign-in:  ${r.adminUsername} / ${password}`);
console.log("Write this password down now. It is shown only once; the admin must choose a new password at the first sign-in.");
