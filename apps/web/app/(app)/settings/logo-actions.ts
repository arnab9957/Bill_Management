"use server";
import { revalidatePath } from "next/cache";
import { removeSchoolLogo, setSchoolLogo } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";

export async function uploadLogoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireRole("settings");
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a logo image first" };
  const r = await run(async () => setSchoolLogo(u, new Uint8Array(await file.arrayBuffer())), "Logo saved. It will appear on new receipts and bills.");
  revalidatePath("/", "layout");
  return r;
}

export async function removeLogoAction(_fd: FormData): Promise<void> {
  const u = await requireRole("settings");
  await removeSchoolLogo(u);
  revalidatePath("/", "layout");
}
