import { requireRole } from "@/lib/auth";
import { today } from "@sb/core";
import { PageHeader } from "@/components/ui";
import { Counter } from "./counter";

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  await requireRole("collect");
  const { student } = await searchParams;
  return (
    <div>
      <PageHeader title="Collect fee" subtitle="Search → amount → mode → Enter. Oldest dues are cleared first." />
      <Counter today={today()} initialStudentId={student ? Number(student) : undefined} />
    </div>
  );
}
