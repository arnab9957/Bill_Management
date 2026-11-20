import Link from "next/link";
import { can, fees, students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { Badge, Card, Empty, LinkButton, Money, PageHeader } from "@/components/ui";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; classId?: string; status?: string }> }) {
  const user = await requireRole("students");
  const sp = await searchParams;
  const { classes } = await fees.masters();
  const { year } = await getWorkingYear();
  const list = await students.searchStudents(sp.q ?? "", { classId: sp.classId ? Number(sp.classId) : undefined, status: sp.status ?? "active", yearId: year.id });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div>
      <PageHeader title="Students" subtitle={`${list.length} enrolled in ${year.name}`} actions={<>
        <LinkButton href={`/api/export/students?${qs}`}>Export Excel</LinkButton>
        {can(user.role, "studentsEdit") && <LinkButton href="/students/import">Import Excel</LinkButton>}
        {can(user.role, "studentsEdit") && <LinkButton variant="primary" href="/students/new">New admission</LinkButton>}
      </>} />
      <Card>
        <form className="toolbar mb-6">
          <input name="q" defaultValue={sp.q} placeholder="Name, admission no., guardian mobile" className="w-full sm:w-72" autoFocus />
          <select name="classId" defaultValue={sp.classId}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select name="status" defaultValue={sp.status ?? "active"}><option value="active">Active</option><option value="left">Left</option><option value="alumni">Alumni</option><option value="">All</option></select>
          <button className="filter-button">Search</button>
        </form>
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
