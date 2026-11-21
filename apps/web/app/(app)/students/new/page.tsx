import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { StudentFields } from "../student-form";
import { DraftStatusBanner, SaveDraftButton } from "./admission-draft-controls";

async function admit(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("studentsEdit");
  const data = formObject(fd);
  if (data.existingGuardianId) delete data.guardian;
  const r = await run(() => students.admitStudent(user, data));
  if (r?.ok) {
    revalidatePath("/students");
    redirect(`/students/${(r.data as { id: number }).id}?created=1`);
  }
  return r;
}

export default async function NewStudent({ searchParams }: { searchParams: Promise<{ sibling?: string }> }) {
  await requireRole("studentsEdit");
  const { sibling } = await searchParams;
  const sib = sibling ? await students.getStudentProfile(Number(sibling)) : null;
  const g = sib?.guardians[0]?.g;
  const { year } = await getWorkingYear();
  const backHref = sib ? `/students/${sib.s.id}` : "/students";
  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="New admission"
        subtitle={g ? `Sibling of ${sib!.s.name} — will share guardian ${g.name}` : undefined}
        actions={<LinkButton href={backHref}>Back</LinkButton>}
      />
      <Card>
        <DraftStatusBanner />
        <ActionForm id="admission-form" action={admit}>
          {g && <input type="hidden" name="existingGuardianId" value={g.id} />}
          <StudentFields withGuardian={!g} yearId={year.id} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Submit>Save admission</Submit>
            <SaveDraftButton />
            <LinkButton variant="secondary" href={backHref}>Cancel</LinkButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
