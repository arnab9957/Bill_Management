import Link from "next/link";
import { can, fees, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { Badge, Card, Empty, LinkButton, Money, PageHeader } from "@/components/ui";
import { StudentFilters } from "./student-filters";
import { DraftAdmissionsList, DraftAdmissionsTrigger } from "./draft-admissions";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; classId?: string; section?: string; sectionId?: string; status?: string }> }) {
  const user = await requireRole("students");
  const sp = await searchParams;
  const { classes, sections } = await fees.masters();
  const { year } = await getWorkingYear();
  const sectionName = sp.section ?? (sp.sectionId ? sections.find((s) => String(s.id) === String(sp.sectionId))?.name : undefined);
  const list = await students.searchStudents(sp.q ?? "", {
    classId: sp.classId ? Number(sp.classId) : undefined,
    sectionName: sectionName || undefined,
    status: sp.status ?? "active",
    yearId: year.id,
  });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div>
      <PageHeader title="Students" subtitle={`${list.length} enrolled in ${year.name}`} actions={<>
        <LinkButton href={`/api/export/students?${qs}`}>Export Excel</LinkButton>
        {can(user.role, "studentsEdit") && <LinkButton href="/students/import">Import Excel</LinkButton>}
        {can(user.role, "studentsEdit") && <DraftAdmissionsTrigger />}
        {can(user.role, "studentsEdit") && <LinkButton variant="primary" href="/students/new">New admission</LinkButton>}
      </>} />
      {can(user.role, "studentsEdit") && <DraftAdmissionsList classes={classes} sections={sections} />}
      <Card>
        <StudentFilters
          classes={classes}
          sections={sections}
          defaultQ={sp.q}
          defaultClassId={sp.classId}
          defaultSection={sp.section}
          defaultSectionId={sp.sectionId}
          defaultStatus={sp.status}
          singleMatchId={sp.q && list.length === 1 ? list[0]!.id : undefined}
          exactMatchId={sp.q && list.length === 1 && list[0]!.admissionNo.toLowerCase() === sp.q.trim().toLowerCase() ? list[0]!.id : undefined}
        />
        {list.length === 0 ? <Empty>No students found in {year.name}. New admissions and promotions into this year appear here.</Empty> : (
          <table className="data">
            <thead><tr><th>Adm. no.</th><th>Name</th><th>Class</th><th>Roll</th><th>Status</th><th className="num">Outstanding</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{s.admissionNo}</td>
                  <td><Link className="font-medium text-ink hover:underline" href={`/students/${s.id}`}>{s.name}</Link></td>
                  <td>{s.className}{s.sectionName ? "-" + s.sectionName : ""}</td>
                  <td>{s.rollNo}</td>
                  <td><Badge>{s.status}</Badge>{"yearStatus" in s && s.yearStatus !== "studying" && <span className="ml-1"><Badge>{String(s.yearStatus)}</Badge></span>}</td>
                  <td className="num">{s.outstanding ? <Money p={s.outstanding} className="text-red-700" /> : "—"}</td>
                  <td className="text-right">{can(user.role, "collect") && <Link className="text-xs text-ink hover:underline" href={`/collect?student=${s.id}`}>Collect</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
