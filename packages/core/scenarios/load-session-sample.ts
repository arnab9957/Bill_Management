/** Load the 3-session sample into DATABASE_URL (a test database) and write a readable report. Run by session-sample.cmd. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPool } from "@sb/db";
import { loadSessionSample, sampleReport } from "./session-sample";

if (!/test|sample/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing: DATABASE_URL does not point at a test database.");
  process.exit(1);
}
const { ids } = await loadSessionSample((s) => console.log(s));
const report = await sampleReport(ids);
const file = resolve(process.cwd(), "../../session-sample-report.txt");
mkdirSync(resolve(file, ".."), { recursive: true });
writeFileSync(file, `SESSION SAMPLE - what happened to each student (Jan 2024 - Nov 2026)\n${report}\n`, "utf8");
console.log(report);
console.log(`\nReport saved to ${file}\nLogins: admin / admin12345   cashier1 / cashier12345`);
await getPool().end();
