// Usage: node scripts/wait-port.mjs <port> [timeoutSeconds] [--check]
// Waits until something accepts connections on 127.0.0.1:<port>. Exit 0 = open, 1 = timed out.
// With --check it tests once and exits immediately.
import { connect } from "node:net";

const port = Number(process.argv[2]);
const timeout = Number(process.argv[3] ?? 60) * 1000;
const once = process.argv.includes("--check");

const tryOnce = () => new Promise((ok) => {
  const s = connect({ port, host: "127.0.0.1" });
  s.setTimeout(1000);
  s.on("connect", () => { s.destroy(); ok(true); });
  s.on("error", () => ok(false));
  s.on("timeout", () => { s.destroy(); ok(false); });
});

const start = Date.now();
for (;;) {
  if (await tryOnce()) process.exit(0);
  if (once || Date.now() - start > timeout) process.exit(1);
  await new Promise((r) => setTimeout(r, 1000));
}
