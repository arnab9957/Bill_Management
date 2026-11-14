import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fees, toRupeeString } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, LinkButton, Money, PageHeader } from "@/components/ui";

const FREQ = { monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", annual: "Annual", one_time: "One-time (new admissions)" } as const;

async function save(path: string, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("fees");
  const r = await run(() => fees.saveStructureItem(u, formObject(fd)), "Saved");
  revalidatePath(path);
  return r;
}
async function remove(path: string, itemId: number) {
  "use server";
  const u = await requireRole("fees");
  await fees.removeStructureItem(u, itemId);
  revalidatePath(path);
}

export default async function StructureEditor({ params }: { params: Promise<{ yearId: string; classId: string }> }) {
  const user = await requireRole("fees");
  const p = await params;
  const yearId = Number(p.yearId), classId = Number(p.classId);
  const m = await fees.masters();
  const year = m.years.find((y) => y.id === yearId), cls = m.classes.find((c) => c.id === classId);
  if (!year || !cls) notFound();
  const st = await fees.getOrCreateStructure(user, yearId, classId);
  const items = await fees.structureItems(st.id);
  const path = `/fees/structure/${yearId}/${classId}`;
  const heads = m.heads.filter((h) => !["LATE_FEE", "OPENING", "BOUNCE", "MISC", "TRANSPORT"].includes(h.code));

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title={`Class ${cls.name} — ${year.name}`} subtitle="Transport is billed from the student's route; late fees from the late-fee rule." actions={<LinkButton href={`/fees?year=${yearId}`}>Back</LinkButton>} />
      <Card title="Heads billed to this class">
        <table className="data">
          <thead><tr><th>Head</th><th className="num">Amount</th><th>Frequency</th><th>Due day</th><th>Months</th><th /></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="text-gray-500">No heads yet.</td></tr>}
            {items.map(({ item, head }) => (
              <tr key={item.id}><td>{head.name}</td><td className="num"><Money p={item.amount} /></td><td>{FREQ[item.frequency]}</td><td>{item.dueDay}</td>
                <td className="text-xs">{item.applicableMonths?.join(", ") ?? "auto"}</td>
                <td className="text-right"><form action={remove.bind(null, path, item.id)}><button className="text-xs text-red-600 hover:underline">Remove</button></form></td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Add or update a head">
        <ActionForm action={save.bind(null, path)} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="structureId" value={st.id} />
          <label className="flex flex-col gap-1 sm:col-span-2">Head<select name="feeHeadId">{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label className="flex flex-col gap-1">Amount ₹<input name="amount" inputMode="decimal" required /><FieldError name="amount" /></label>
          <label className="flex flex-col gap-1">Frequency<select name="frequency">{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="flex flex-col gap-1">Due day<input name="dueDay" type="number" min={1} max={28} defaultValue={10} /><FieldError name="dueDay" /></label>
          <label className="flex flex-col gap-1">Months (optional)<input name="applicableMonths" placeholder="e.g. 4,7,10,1" /><FieldError name="applicableMonths" /></label>
          <div className="sm:col-span-6"><Submit>Save head</Submit></div>
        </ActionForm>
        <p className="mt-2 text-xs text-gray-500">Months are calendar months (1 = Jan). Leave empty to bill by frequency from the start of the academic year. Existing amounts: {items.map(({ head, item }) => `${head.name} ${toRupeeString(item.amount)}`).join(", ") || "—"}.</p>
      </Card>
    </div>
  );
}
