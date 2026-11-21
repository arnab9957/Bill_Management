/** Run the year-end promotion round on the test school (DATABASE_URL) and print what happened to each student. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as db from "@sb/db";
import { SPECS } from "./scenarios";
import { promotionRound, roundReport } from "./promotion-round";

if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing: DATABASE_URL does not point at a test database.");
  process.exit(1);
}
const rows = await db.getDb().select({ id: db.students.id, adm: db.students.admissionNo }).from(db.students);
const ids = Object.fromEntries(rows.filter((r) => SPECS.some((s) => s.adm === r.adm)).map((r) => [r.adm, r.id]));
if (Object.keys(ids).length !== SPECS.length) { console.error("The 50 test students are not loaded. Run test-school.cmd first."); process.exit(1); }
await promotionRound(ids, (s) => console.log(s));
const report = await roundReport(ids, SPECS);
const file = resolve(process.cwd(), "../../promotion-round-report.txt");
writeFileSync(file, `YEAR-END PROMOTION ROUND (daily job on 2 April 2027) - test school\n\n${report}\n`, "utf8");
console.log(`\n${report}\n\nReport saved to ${file}`);
await db.getPool().end();
