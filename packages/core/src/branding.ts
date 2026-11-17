import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { eq } from "drizzle-orm";
import { env, getDb, schoolSettings } from "@sb/db";
import { AppError, audit, clearSettingsCache, getSettings, type Actor } from "./common";

/** The school's logo: a small picture printed at the top of receipts and bills. */
const MAX_BYTES = 1024 * 1024;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const brandingDir = () => join(env().STORAGE_DIR, "branding");

/** Recognise PNG, JPEG or WebP from the first bytes of the file (the file name is not trusted). */
function imageType(b: Uint8Array): "png" | "jpg" | "webp" | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export async function setSchoolLogo(actor: Actor, data: Uint8Array): Promise<void> {
  if (data.byteLength === 0) throw new AppError("Choose a logo image first");
  if (data.byteLength > MAX_BYTES) throw new AppError("The logo is larger than 1 MB. Use a smaller picture.");
  const type = imageType(data);
  if (!type) throw new AppError("Only PNG, JPG or WebP logos are allowed");
  const db = getDb();
  const before = await getSettings(db);
  await mkdir(brandingDir(), { recursive: true });
  const file = `logo-${Date.now()}.${type}`;
  await writeFile(join(brandingDir(), file), data);
  await db.update(schoolSettings).set({ logoPath: file }).where(eq(schoolSettings.id, 1));
  clearSettingsCache();
  if (before.logoPath) await rm(join(brandingDir(), basename(before.logoPath)), { force: true });
  await audit(db, actor, "logo", "school_settings", 1, { logo: before.logoPath }, { logo: file });
}

export async function removeSchoolLogo(actor: Actor): Promise<void> {
  const db = getDb();
  const before = await getSettings(db);
  if (!before.logoPath) return;
  await db.update(schoolSettings).set({ logoPath: null }).where(eq(schoolSettings.id, 1));
  clearSettingsCache();
  await rm(join(brandingDir(), basename(before.logoPath)), { force: true });
  await audit(db, actor, "logo_remove", "school_settings", 1, { logo: before.logoPath }, null);
}

/** The logo file and its type, or null when the school has none. */
export async function readSchoolLogo(): Promise<{ data: Buffer; mime: string } | null> {
  const s = await getSettings();
  if (!s.logoPath) return null;
  const name = basename(s.logoPath);
  try {
    return { data: await readFile(join(brandingDir(), name)), mime: MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** The logo as an embedded picture, so it prints even before the browser has loaded it. */
export async function schoolLogoDataUri(): Promise<string | null> {
  const logo = await readSchoolLogo();
  return logo ? `data:${logo.mime};base64,${logo.data.toString("base64")}` : null;
}
