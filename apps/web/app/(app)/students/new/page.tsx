import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { billing, fees, getCurrentYear, periodOf, students, today } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { StudentFields } from "../student-form";
import { DraftStatusBanner, SaveDraftButton, CollectNowCheckbox } from "./admission-draft-controls";

async function admit(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("studentsEdit");
  const data = formObject(fd);
  if (data.existingGuardianId) delete data.guardian;

  // 1. Check whether user requested to collect fee now
  const collectNow = data.collectNow === "on" || data.collectNow === "true" || data.collectNow === "1";
  const classId = Number(data.classId);
  const m = await fees.masters();
  const clsObj = m.classes.find((c) => c.id === classId);
  const yearId = Number(data.academicYearId) || (await getCurrentYear()).id;

  // 2. If collectNow is requested, check if fee structure exists for this class
  if (collectNow && classId) {
    const structure = await fees.getOrCreateStructure(user, yearId, classId);
    const items = await fees.structureItems(structure.id);
    if (!items || items.length === 0) {
      const clsName = clsObj?.name ? `Class ${clsObj.name}` : "this class";
      const structureUrl = `/fees/structure/${yearId}/${classId}`;
      return {
        ok: false,
        message: `No fee structure set up yet for ${clsName}. To collect fee now, please configure the class fee structure first.`,
        data: {
          feeStructureMissing: true,
          structureUrl,
          className: clsObj?.name,
        },
      };
    }
  }

  // 3. Admit student
  const r = await run(() => students.admitStudent(user, data));
  if (r?.ok && r.data) {
    const newStudent = r.data as { id: number; admissionDate?: string };
    const studentId = newStudent.id;

    if (collectNow) {
      // Generate due bills based on fee structure for the admission period
      try {
        const admDate = (typeof data.admissionDate === "string" && data.admissionDate.trim()) ? data.admissionDate : today();
        const period = periodOf(admDate);
        await billing.generateInvoices({ period, studentId, dryRun: false }, user);
      } catch (billErr) {
        console.error("Auto bill generation failed on admission:", billErr);
      }

      revalidatePath("/students");
      revalidatePath("/collect");
      redirect(`/collect?student=${studentId}`);
    } else {
      revalidatePath("/students");
      redirect(`/students/${studentId}?created=1`);
    }
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

  // Pre-load which classes have configured fee structures in this year
  const structuresList = await fees.listStructures(year.id);
  const configuredClassIds = structuresList.filter((s) => s.items > 0).map((s) => s.classId);

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
          <div className="mt-6 border-t border-gray-100 pt-6">
            <CollectNowCheckbox yearId={year.id} configuredClassIds={configuredClassIds} />
          </div>
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
