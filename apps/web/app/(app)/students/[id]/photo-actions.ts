"use server";
import { revalidatePath } from "next/cache";
import { students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";

export async function uploadPhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireRole("studentsEdit");
  const id = Number(fd.get("studentId"));
  const f = fd.get("photo");
  if (!(f instanceof File) || f.size === 0) return { ok: false, message: "Choose a photo first" };
  const r = await run(async () => { await students.setStudentPhoto(u, id, new Uint8Array(await f.arrayBuffer())); }, "Photo saved");
  revalidatePath(`/students/${id}`);
  return r ? { ok: r.ok, message: r.message } : r;
}

export async function removePhotoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireRole("studentsEdit");
  const id = Number(fd.get("studentId"));
  const r = await run(() => students.removeStudentPhoto(u, id), "Photo removed");
  revalidatePath(`/students/${id}`);
  return r ? { ok: r.ok, message: r.message } : r;
}
