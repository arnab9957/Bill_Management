import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(ROOT, "apps", "web");
const require = createRequire(join(webDir, "package.json"));
const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error("Usage: next-cli.mjs dev|start");
  process.exit(1);
}
const host = process.env.SB_HOST || "127.0.0.1";
const port = Number(process.env.SB_PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid SB_PORT: ${process.env.SB_PORT}`);
  process.exit(1);
}
const args = [require.resolve("next/dist/bin/next"), mode];
if (mode === "dev") args.push("--turbopack");
args.push("-H", host, "-p", String(port));
const result = spawnSync(process.execPath, args, { cwd: webDir, stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
