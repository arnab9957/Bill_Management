import { fees, students } from "@sb/core";
import type { Student, Guardian, StudentEnrollment } from "@sb/db";
import { StudentInputs, GuardianInputs } from "./student-inputs";

/** Shared admission / edit fields (server component rendered inside an ActionForm). */
/**
 * Shared admission / edit fields. Class, section and roll belong to ONE academic year:
 * `yearId` picks which year (admission: the year the student joins; edit: the year being edited).
 */
export async function StudentFields({ s, withGuardian, guardian, yearId, enrollment, yearLocked }: {
  s?: Student; withGuardian?: boolean; guardian?: Guardian; yearId?: number; enrollment?: StudentEnrollment | null; yearLocked?: boolean;
}) {
  const m = await fees.masters();
  const effectiveYearId = yearId ?? m.years.find((y) => y.isCurrent)?.id ?? m.years[0]?.id ?? 1;
  const admissionData = await students.getAdmissionFormData(effectiveYearId);

  const cls = enrollment?.classId ?? s?.classId;
  const sec = enrollment ? enrollment.sectionId : s?.sectionId;
  const roll = enrollment ? enrollment.rollNo : s?.rollNo;
  return (
    <div className="space-y-7">
      <StudentInputs
        m={m}
        s={s}
        yearId={effectiveYearId}
        yearLocked={yearLocked}
        cls={cls}
        sec={sec}
        roll={roll}
        nextAdmissionNo={admissionData.nextAdmissionNo}
        existingAdmissionNos={admissionData.existingAdmissionNos}
        rollsByClassSection={admissionData.rollsByClassSection}
        rollFormat={admissionData.rollFormat}
      />
      {withGuardian && <GuardianFields g={guardian} prefix="guardian." />}
    </div>
  );
}

export function GuardianFields({ g, prefix = "" }: { g?: Guardian; prefix?: string }) {
  return <GuardianInputs g={g} prefix={prefix} />;
}
