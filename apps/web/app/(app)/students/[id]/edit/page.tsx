import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { GuardianFields, StudentFields } from "../../student-form";

async function save(studentId: number, guardianId: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("studentsEdit");
  const data = formObject(fd);
  const r = await run(async () => {
    await students.updateStudent(user, studentId, data);
    if (guardianId && data.guardian) await students.updateGuardian(user, guardianId, data.guardian);
  });
  if (r?.ok) { revalidatePath(`/students/${studentId}`); redirect(`/students/${studentId}?saved=1`); }
  return r;
}

export default async function EditStudent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  await requireRole("studentsEdit");
  const id = Number((await params).id);
  const p = await students.getStudentProfile(id);
  if (!p) notFound();
  const history = await students.listEnrollments(id);
  const latest = history.at(-1);
  const wantYear = Number((await searchParams).year);
  const sel = history.find((h) => h.e.academicYearId === wantYear) ?? latest;
  const g = p.guardians.find((x) => x.isPrimary)?.g ?? p.guardians[0]?.g;
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={`Edit ${p.s.name}`} subtitle="Personal and parent details apply to every year. Class, section and roll are saved for the selected academic year only."
        actions={<LinkButton href={`/students/${id}`}>Back to profile</LinkButton>} />
      {history.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Edit class for:</span>
          {history.map((h) => (
            <Link key={h.e.id} href={`?year=${h.e.academicYearId}`}
              className={`rounded-md border px-3 py-1 ${h.e.id === sel?.e.id ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-gray-300 bg-white"}`}>
              {h.yearName} · {h.className}
            </Link>
          ))}
        </div>
      )}
      {sel && sel.e.id !== latest?.e.id && <Notice tone="warn">You are correcting an earlier year ({sel.yearName}). Bills already issued for that year are not changed.</Notice>}
      <Card>
        <ActionForm action={save.bind(null, id, g?.id ?? null)}>
          <StudentFields s={p.s} yearId={sel?.e.academicYearId} enrollment={sel?.e} yearLocked />
          {g && <div className="mt-6"><GuardianFields g={g} prefix="guardian." /></div>}
          <div className="mt-6"><Submit>Save changes</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
