import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { auditLog, numberSeries, schoolSettings, academicYears, env, getDb, type Executor, type Role } from "@sb/db";
import { providerConfigSchema, type ProviderConfig } from "@sb/validation";

/** Who is acting. `id: null` = the system (worker jobs). */
export interface Actor {
  id: number | null;
  role: Role | "SYSTEM";
  username: string;
  fullName: string;
  ip?: string;
}
export const SYSTEM: Actor = { id: null, role: "SYSTEM", username: "system", fullName: "System" };

/** Expected business error, safe to show to the user. */
export class AppError extends Error {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
  }
}

// ---------------------------------------------------------------- audit
export async function audit(
  tx: Executor,
  actor: Actor,
  action: string,
  tableName: string,
  recordId: string | number | null,
  oldValues?: unknown,
  newValues?: unknown,
): Promise<void> {
  await tx.insert(auditLog).values({
    userId: actor.id,
    action,
    tableName,
    recordId: recordId == null ? null : String(recordId),
    oldValues: oldValues ?? null,
    newValues: newValues ?? null,
    ip: actor.ip ?? null,
  });
}

// ---------------------------------------------------------------- numbering
/**
 * Gap-free number from a locked counter row. Must run inside the same
 * transaction as the insert that uses it: on rollback the number is released.
 */
export async function nextNumber(tx: Executor, series: string): Promise<number> {
  const res = await tx
    .insert(numberSeries)
    .values({ key: series, lastValue: 1 })
    .onConflictDoUpdate({ target: numberSeries.key, set: { lastValue: sql`${numberSeries.lastValue} + 1` } })
    .returning({ v: numberSeries.lastValue });
  return res[0]!.v;
}
export const formatDocNo = (prefix: string, yearName: string, n: number) => `${prefix}/${yearName}/${String(n).padStart(6, "0")}`;

// ---------------------------------------------------------------- receipt numbering
export interface ReceiptNumbering { receiptPrefix: string; receiptIncludeYear: boolean; receiptDigits: number }

/** Counter a receipt number is drawn from: one running series per prefix, or one per prefix and academic year. */
export const receiptSeriesKey = (s: Pick<ReceiptNumbering, "receiptPrefix" | "receiptIncludeYear">, yearName: string) =>
  `RECEIPT:${s.receiptPrefix}${s.receiptIncludeYear ? `:${yearName}` : ""}`;

/** "C/6434" (continuous, no padding) or "RCT/2026-27/000123" (restarts every year, 6 digits). */
export const formatReceiptNo = (s: ReceiptNumbering, yearName: string, n: number) =>
  [s.receiptPrefix, s.receiptIncludeYear ? yearName : null, String(n).padStart(s.receiptDigits, "0")].filter(Boolean).join("/");

/** What the next receipt will be called, and whether the series can still be started from another number. */
export async function receiptNumberPreview(db: Executor = getDb()) {
  const s = await getSettings(db);
  let year;
  try { year = await getCurrentYear(db); } catch { return null; }
  const key = receiptSeriesKey(s, year.name);
  const [row] = await db.select().from(numberSeries).where(eq(numberSeries.key, key));
  const next = (row?.lastValue ?? 0) + 1;
  const issued = row ? Math.max(0, row.lastValue - row.startValue + 1) : 0;
  return { next, text: formatReceiptNo(s, year.name, next), issued, canSetStart: issued === 0, series: key.replace(/^RECEIPT:/, "") };
}

/**
 * Continue the school's paper receipt book: the next receipt gets number `nextNo`.
 * Only possible while no receipt has been issued in the current series, so numbers
 * never go backwards or leave a gap inside a series.
 */
export async function setNextReceiptNumber(actor: Actor, nextNo: number): Promise<string> {
  if (!Number.isInteger(nextNo) || nextNo < 1 || nextNo > 2_000_000_000) throw new AppError("Enter a whole number, 1 or more", { next: "Invalid number" });
  return getDb().transaction(async (tx) => {
    const s = await getSettings(tx);
    const year = await getCurrentYear(tx);
    const key = receiptSeriesKey(s, year.name);
    const [row] = await tx.select().from(numberSeries).where(eq(numberSeries.key, key)).for("update");
    const issued = row ? Math.max(0, row.lastValue - row.startValue + 1) : 0;
    if (issued > 0) {
      throw new AppError(`Receipts have already been issued in this series (last: ${formatReceiptNo(s, year.name, row!.lastValue)}). To start from another number, change the receipt prefix first.`);
    }
    await tx.insert(numberSeries).values({ key, lastValue: nextNo - 1, startValue: nextNo })
      .onConflictDoUpdate({ target: numberSeries.key, set: { lastValue: nextNo - 1, startValue: nextNo } });
    const next = formatReceiptNo(s, year.name, nextNo);
    await audit(tx, actor, "set_next_number", "number_series", key, row ?? null, { next });
    return next;
  });
}

// ---------------------------------------------------------------- settings
// Settings are read on every page; cache them briefly in-process. Writes clear the cache.
let settingsCache: { at: number; row: typeof schoolSettings.$inferSelect } | undefined;
const SETTINGS_TTL_MS = 30_000;
export const clearSettingsCache = () => { settingsCache = undefined; };

export async function getSettings(db?: Executor) {
  if (!db && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.row;
  const row = await loadSettings(db ?? getDb());
  if (!db) settingsCache = { at: Date.now(), row };
  return row;
}

async function loadSettings(db: Executor) {
  const [row] = await db.select().from(schoolSettings).where(eq(schoolSettings.id, 1));
  if (row) return row;
  const [created] = await db.insert(schoolSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schoolSettings).where(eq(schoolSettings.id, 1)))[0]!;
}

export async function getCurrentYear(db: Executor = getDb()) {
  const [y] = await db.select().from(academicYears).where(eq(academicYears.isCurrent, true));
  if (!y) throw new AppError("No current academic year is set. Configure it under Settings → Academic years.");
  return y;
}

/** Find the academic year that contains a date. */
export async function yearForDate(db: Executor, date: string) {
  const [y] = await db.select().from(academicYears)
    .where(sql`${academicYears.startDate} <= ${date} and ${academicYears.endDate} >= ${date}`);
  if (!y) throw new AppError(`No academic year covers ${date}.`);
  return y;
}

// ---------------------------------------------------------------- secrets at rest
const key = () => createHash("sha256").update(env().APP_SECRET).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(enc!), d.final()]).toString("utf8");
}

export async function getProviderConfig(db: Executor = getDb()): Promise<ProviderConfig> {
  const s = await getSettings(db);
  if (!s.providerConfigEnc) return providerConfigSchema.parse({});
  try {
    return providerConfigSchema.parse(JSON.parse(decryptSecret(s.providerConfigEnc)));
  } catch {
    return providerConfigSchema.parse({});
  }
}

export async function saveProviderConfig(db: Executor, actor: Actor, cfg: ProviderConfig) {
  await getSettings(db);
  await db.update(schoolSettings).set({ providerConfigEnc: encryptSecret(JSON.stringify(cfg)) }).where(eq(schoolSettings.id, 1));
  clearSettingsCache();
  await audit(db, actor, "update", "provider_config", 1, null, { modes: [cfg.emailMode, cfg.whatsappMode, cfg.smsMode] });
}

export async function updateSchoolSettings(actor: Actor, input: unknown) {
  const { schoolSettingsSchema } = await import("@sb/validation");
  const d = schoolSettingsSchema.partial().parse(input);
  const db = getDb();
  const old = await getSettings(db);
  const { receiptNumbering, ...rest } = d;
  // Fields left out (undefined) are not touched, so scripts can update a few settings safely.
  await db.update(schoolSettings).set({
    ...rest,
    receiptIncludeYear: receiptNumbering === undefined ? undefined : receiptNumbering === "per_year",
    upiId: d.upiId === undefined ? undefined : d.upiId || null,
    backupPath: d.backupPath === undefined ? undefined : d.backupPath || null,
  }).where(eq(schoolSettings.id, 1));
  clearSettingsCache();
  await audit(db, actor, "update", "school_settings", 1, { ...old, providerConfigEnc: undefined }, d);
}
