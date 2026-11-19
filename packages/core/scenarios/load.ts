/**
 * Load the 50 test students (and optionally N generated ones) into the database in DATABASE_URL
 * (made by `seed.ts --demo`). Run by test-school.cmd, which points DATABASE_URL at a separate test database.
 *   tsx scenarios/load.ts            50 hand-written situations
 *   tsx scenarios/load.ts 1000       + 1,000 generated students (B0001-B1000)
 */
import { getPool } from "@sb/db";
import { SPECS, bulkSpecs, loadScenarios } from "./scenarios";

if (!/testschool|test/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to load test students: DATABASE_URL does not point at a test database.");
  process.exit(1);
}
const extra = Number(process.argv[2] ?? 0);
const L = await loadScenarios((s) => console.log(s));
console.log("\nTest students (search by admission no.):\n");
for (const s of SPECS) console.log(`  ${s.adm}  ${s.name.padEnd(18)} ${("Class " + s.cls).padEnd(13)} ${s.story}`);
if (extra > 0) {
  console.log(`\nAdding ${extra} generated students (B0001-B${String(extra).padStart(4, "0")}); this takes a few minutes...`);
  await loadScenarios((s) => console.log(s), bulkSpecs(extra));
}
console.log(`\nLogins:  admin / admin12345   and   cashier1 / cashier12345   (${Object.keys(L.ids).length + Math.max(extra, 0)} students loaded)`);
await getPool().end();
