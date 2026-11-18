import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "packages/db/package.json"));

export function validCode(code) {
  return typeof code === "string" && code.length > 0 && code.length <= 40 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code);
}

export function assertCode(code) {
  if (!validCode(code)) throw new Error(`Institute code must be 1-40 lowercase letters, digits or single hyphens: '${code}'`);
}

export function findWorkspaceRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return ROOT;
    dir = parent;
  }
}

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

export function readEnvFile(file) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}

export function dbParts(url) {
  if (!url) throw new Error("DATABASE_URL is missing");
  const u = new URL(url);
  return {
    databaseUrl: u.toString(),
    user: decodeURIComponent(u.username || ""),
    password: decodeURIComponent(u.password || ""),
    host: u.hostname || "127.0.0.1",
    port: Number(u.port || 5432),
    db: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
  };
}

export function withDatabase(url, db) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function instancePaths(code) {
  if (code === "default") {
    return {
      dir: ROOT,
      envFile: join(ROOT, ".env"),
      configFile: join(ROOT, ".env"),
      profileFile: "",
      storageDir: join(ROOT, "storage"),
    };
  }
  assertCode(code);
  const dir = join(ROOT, "instances", code);
  return {
    dir,
    envFile: join(dir, ".env"),
    configFile: join(dir, "institute.json"),
    profileFile: join(dir, "profile.json"),
    storageDir: join(dir, "storage"),
  };
}

export function readInstance(code = process.env.SB_INSTANCE || "default") {
  const paths = instancePaths(code);
  if (code === "default") {
    const env = readEnvFile(paths.envFile);
    const url = env.DATABASE_URL || process.env.DATABASE_URL;
    const db = dbParts(url);
    return {
      code: "default",
      name: env.SB_INSTANCE_NAME || "Default installation",
      ...db,
      dbName: db.db,
      host: env.SB_HOST || process.env.SB_HOST || "127.0.0.1",
      webPort: Number(env.SB_PORT || env.PORT || process.env.SB_PORT || process.env.PORT || 3000),
      profileFile: "",
      storageDir: resolve(ROOT, env.STORAGE_DIR || process.env.STORAGE_DIR || "storage"),
      serviceWeb: "SchoolBillingWeb",
      serviceWorker: "SchoolBillingWorker",
      firewallRule: "School Billing (LAN)",
      pgDump: env.PG_DUMP_PATH || process.env.PG_DUMP_PATH || "pg_dump",
      envFile: paths.envFile,
      dir: ROOT,
    };
  }
  if (!existsSync(paths.configFile)) throw new Error(`Institute '${code}' is not set up: ${paths.configFile} is missing.`);
  if (!existsSync(paths.envFile)) throw new Error(`Institute '${code}' has no .env file: ${paths.envFile}`);
  const cfg = JSON.parse(readFileSync(paths.configFile, "utf8"));
  const env = readEnvFile(paths.envFile);
  const db = dbParts(env.DATABASE_URL);
  return {
    ...cfg,
    code,
    name: cfg.name || code,
    ...db,
    dbName: cfg.dbName || db.db,
    host: cfg.host || env.SB_HOST || "127.0.0.1",
    webPort: Number(cfg.webPort || env.SB_PORT || 3000),
    profileFile: paths.profileFile,
    storageDir: resolve(ROOT, env.STORAGE_DIR || join("instances", code, "storage")),
    serviceWeb: cfg.serviceWeb || `SchoolBillingWeb-${code}`,
    serviceWorker: cfg.serviceWorker || `SchoolBillingWorker-${code}`,
      firewallRule: cfg.firewallRule || `School Billing (${code})`,
      pgDump: env.PG_DUMP_PATH || "pg_dump",
      envFile: paths.envFile,
      dir: paths.dir,
    };

}

export function listInstances() {
  const dir = join(ROOT, "instances");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && validCode(e.name) && existsSync(join(dir, e.name, "institute.json")))
    .map((e) => e.name)
    .sort();
}

export function resolveProfile(name) {
  if (!name) throw new Error("A profile file name is required.");
  if (basename(name) === name) {
    for (const folder of ["profiles", join("profiles", "local"), join("profiles", "examples")]) {
      const full = join(ROOT, folder, name);
      if (existsSync(full)) return full;
    }
  }
  const full = resolve(process.cwd(), name);
  if (existsSync(full)) return full;
  throw new Error(`Profile not found: ${name}`);
}

export function findFreePort(start = 3000) {
  const net = require("node:net");
  return new Promise((ok, bad) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE" && start < 65535) ok(findFreePort(start + 1));
      else bad(err);
    });
    server.once("listening", () => server.close(() => ok(start)));
    server.listen(start, "127.0.0.1");
  });
}

export function getValue(cfg, key) {
  switch (key) {
    case "code": return cfg.code;
    case "name": return cfg.name;
    case "databaseUrl": return cfg.databaseUrl;
    case "db": case "dbName": return cfg.dbName;
    case "dbUser": case "user": return cfg.user;
    case "dbPassword": case "password": return cfg.password;
    case "dbHost": case "host": return cfg.host;
    case "dbPort": case "port": return String(cfg.port);
    case "webPort": return String(cfg.webPort);
    case "bind": return cfg.host;
    case "profile": return cfg.profileFile;
    case "storage": case "storageDir": return cfg.storageDir;
    case "envFile": return cfg.envFile;
    case "dir": return cfg.dir;
    case "serviceWeb": return cfg.serviceWeb;
    case "serviceWorker": return cfg.serviceWorker;
    case "firewallRule": return cfg.firewallRule;
    case "pgDump": return cfg.pgDump;
    default: throw new Error(`Unknown instance value: ${key}`);
  }
}

export async function doctor(code) {
  const cfg = readInstance(code);
  const checks = [];
  const push = (ok, label) => checks.push({ ok, label });
  push(existsSync(cfg.envFile), `env file: ${cfg.envFile}`);
  push(!cfg.profileFile || existsSync(cfg.profileFile), `profile: ${cfg.profileFile || "n/a"}`);
  for (const sub of ["", "branding", "photos", "backups", "logs"]) {
    push(existsSync(join(cfg.storageDir, sub)), `storage: ${join(cfg.storageDir, sub)}`);
  }
  const { Client } = require("pg");
  const client = new Client({ connectionString: cfg.databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const r = await client.query("select current_database() as db, current_user as usr");
    push(true, `database: ${r.rows[0].db} as ${r.rows[0].usr}`);
  } catch (e) {
    push(false, `database: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
  for (const c of checks) console.log(`${c.ok ? "OK  " : "FAIL"} ${c.label}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
  return checks;
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  const [command, codeArg, key] = process.argv.slice(2);
  try {
    if (command === "list") {
      for (const code of listInstances()) console.log(code);
    } else if (command === "validate") {
      const code = codeArg || process.env.SB_INSTANCE || "default";
      readInstance(code);
      console.log(code);
    } else if (command === "get") {
      const cfg = readInstance(codeArg);
      console.log(getValue(cfg, key));
    } else if (command === "doctor") {
      await doctor(codeArg || process.env.SB_INSTANCE || "default");
    } else {
      console.error("Usage: instance.mjs list|validate <code>|get <code> <key>|doctor <code>");
      process.exit(1);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
