"use server";

import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/auth";

export interface FolderList { path: string; parent: string | null; folders: string[]; error?: string }

/** Lists sub-folders of a folder on the server's disk (drives when empty, on Windows). Admin only. */
export async function listFolders(dir: string): Promise<FolderList> {
  await requireRole("settings");
  const win = process.platform === "win32";
  if (!dir.trim()) {
    if (win) {
      const drives = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((d) => d + ":\\").filter((d) => existsSync(d));
      return { path: "", parent: null, folders: drives };
    }
    dir = "/";
  }
  const full = path.resolve(dir);
  const up = path.dirname(full);
  const parent = up === full ? (win ? "" : null) : up;
  try {
    const items = await readdir(full, { withFileTypes: true });
    const folders = items.filter((i) => i.isDirectory() && !i.name.startsWith("$") && !i.name.startsWith("."))
      .map((i) => path.join(full, i.name)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return { path: full, parent, folders };
  } catch {
    return { path: full, parent, folders: [], error: "This folder can't be opened." };
  }
}

/** Creates a new folder inside a folder and returns its path. Admin only. */
export async function makeFolder(dir: string, name: string): Promise<{ path?: string; error?: string }> {
  await requireRole("settings");
  const clean = name.trim();
  if (!dir || !clean || /[\\/:*?"<>|]/.test(clean)) return { error: "Enter a valid folder name." };
  const full = path.join(path.resolve(dir), clean);
  try { await mkdir(full, { recursive: true }); return { path: full }; } catch { return { error: "Couldn't create the folder here." }; }
}
