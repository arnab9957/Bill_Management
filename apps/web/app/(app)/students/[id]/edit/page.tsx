import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { GuardianFields, StudentFields } from "../../student-form";

async function save(studentId: number, guardianId: number | null, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("studentsEdit");
  const data = formObject(fd);
  const r = await run(async () => {
    await students.updateStudent(user, studentId, data);
    if (guardianId && data.guardian) await students.updateGuardian(user, guardianId, data.guardian);
  });
  if (r?.ok) { revalidatePath(`/students/${studentId}`); redirect(`/students/${studentId}`); }
  return r;
}

export default async function EditStudent({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("studentsEdit");
  const id = Number((await params).id);
  const p = await students.getStudentProfile(id);
  if (!p) notFound();
  const g = p.guardians[0]?.g;
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${p.s.name}`} />
      <Card>
        <ActionForm action={save.bind(null, id, g?.id ?? null)}>
          <StudentFields s={p.s} />
          {g && <div className="mt-6"><GuardianFields g={g} prefix="guardian." /></div>}
          <div className="mt-6"><Submit>Save changes</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
