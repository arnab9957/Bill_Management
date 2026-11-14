"use server";
import { revalidatePath } from "next/cache";
import { payments, students } from "@sb/core";
import type { CollectPaymentInput } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { run } from "@/lib/action";

export async function searchAction(q: string) {
  await requireRole("collect");
  if (q.trim().length < 1) return [];
  return students.searchStudents(q, { limit: 15 });
}

export async function loadStudentAction(studentId: number) {
  await requireRole("collect");
  const [profile, view] = await Promise.all([students.getStudentProfile(studentId), payments.counterView(studentId)]);
  if (!profile) return null;
  return {
    id: profile.s.id, name: profile.s.name, admissionNo: profile.s.admissionNo, status: profile.s.status,
    className: profile.className, sectionName: profile.sectionName, photoPath: profile.s.photoPath,
    guardian: profile.guardians[0] ? `${profile.guardians[0].g.name} · ${profile.guardians[0].g.mobile}` : "",
    siblings: profile.siblings, ...view,
  };
}

export async function collectAction(input: CollectPaymentInput) {
  const user = await requireRole("collect");
  const res = await run(() => payments.collectPayment(input, user), (r) => `Receipt ${r.receiptNo} saved`);
  revalidatePath("/");
  revalidatePath(`/students/${input.studentId}`);
  return res;
}
