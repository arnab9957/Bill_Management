import { notFound } from "next/navigation";
import { formatDate, getSettings, students, today } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";
import { Notice } from "@/components/ui";

/** No-dues certificate, required before issuing a Transfer Certificate. */
export default async function NoDues({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("studentsEdit");
  const id = Number((await params).id);
  const [p, l, s] = await Promise.all([students.getStudentProfile(id), students.studentLedger(id), getSettings()]);
  if (!p) notFound();
  const due = l.invoices.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.balance, 0);
  if (due > 0) return <Notice tone="error">This student still has dues. A no-dues certificate cannot be issued.</Notice>;
  return (
    <div className="mx-auto max-w-2xl">
      <PrintControls />
      <div className="print-area rounded-lg border border-gray-200 bg-white p-10 text-sm leading-7">
        <div className="text-center"><div className="text-xl font-bold">{s.name}</div><div className="text-xs">{s.address}</div>
          <div className="mt-4 text-lg font-semibold underline">NO DUES CERTIFICATE</div></div>
        <p className="mt-6">Date: {formatDate(today())}</p>
        <p className="mt-4">This is to certify that <b>{p.s.name}</b> (Admission No. <b>{p.s.admissionNo}</b>), student of Class <b>{p.className}</b>,
          has cleared all fee dues payable to the school up to {formatDate(today())}. Nothing is outstanding against the student in the school&apos;s fee records.</p>
        <div className="mt-16 flex justify-between"><span>Accountant</span><span>Principal</span></div>
      </div>
    </div>
  );
}
