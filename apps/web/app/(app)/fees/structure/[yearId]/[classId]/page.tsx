import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fees, toRupeeString, getSettings, schoolLogoDataUri, amountInWords } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { Card, LinkButton, Money, PageHeader } from "@/components/ui";
import { StructureHeadForm } from "./structure-head-form";

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
  const [st, settings, logoSrc, late] = await Promise.all([
    fees.getOrCreateStructure(user, yearId, classId),
    getSettings(),
    schoolLogoDataUri(),
    fees.getLateFeeRule(yearId),
  ]);
  const items = await fees.structureItems(st.id);
  const path = `/fees/structure/${yearId}/${classId}`;

  // All active fee heads from "Active fee heads, you added" (strictly excluding LATE_FEE and system heads)
  const heads = m.heads
    .filter((h) => !["LATE_FEE", "OPENING", "BOUNCE", "TRANSPORT"].includes(h.code))
    .sort((a, b) => {
      const orderA = a.receiptOrder ?? 999;
      const orderB = b.receiptOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

  // Late fee is auto-added to all classes if amount is more than 0
  const isLateActive = Boolean(late && late.amount > 0);
  const lateHead = m.heads.find((h) => h.code === "LATE_FEE");

  // Sort heads according to receipt row order for the print format preview
  const receiptItems = [...items].sort((a, b) => {
    const orderA = a.head.receiptOrder ?? 999;
    const orderB = b.head.receiptOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.head.name.localeCompare(b.head.name);
  });
  const latePaise = isLateActive && late && late.kind !== "percent" ? late.amount : 0;
  const totalPaise = items.reduce((sum, x) => sum + x.item.amount, 0) + latePaise;
  const totalRs = Math.floor(totalPaise / 100);
  const totalPs = String(totalPaise % 100).padStart(2, "0");

  return (
    <div className="space-y-4">
      <PageHeader title={`${cls.name} - ${year.name}`} subtitle="Transport is billed from the student's route; late fees from the late-fee rule." actions={<LinkButton href={`/fees?year=${yearId}`}>Back</LinkButton>} />

      <StructureHeadForm
        structureId={st.id}
        yearId={yearId}
        heads={heads}
        existingItems={items}
        saveAction={save.bind(null, path)}
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] xl:grid-cols-[1.15fr_0.85fr] items-start">
        {/* Left: Heads billed to this class */}
        <Card title="Heads billed to this class">
          <table className="data">
            <thead>
              <tr>
                <th>Head</th>
                <th className="text-center">Amount</th>
                <th className="text-center">Frequency</th>
                <th className="text-center">Due day</th>
                <th className="text-center">Months</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !isLateActive && (
                <tr>
                  <td colSpan={6} className="text-gray-500 py-4 text-center">
                    No heads billed to this class yet.
                  </td>
                </tr>
              )}
              {items.map(({ item, head }) => (
                <tr key={item.id}>
                  <td>{head.name}</td>
                  <td className="text-center"><Money p={item.amount} /></td>
                  <td className="text-center">{FREQ[item.frequency]}</td>
                  <td className="text-center">{item.dueDay}</td>
                  <td className="text-center text-xs">{item.applicableMonths?.join(", ") ?? "auto"}</td>
                  <td className="text-right">
                    <form action={remove.bind(null, path, item.id)}>
                      <button className="text-xs text-red-600 hover:underline">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
              {isLateActive && late && (
                <tr className="bg-amber-50/40">
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900">{lateHead?.name ?? "Late Fee"}</span>
                      <span className="rounded bg-accent-soft px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-accent-ink border border-accent/20">
                        Auto
                      </span>
                    </div>
                  </td>
                  <td className="text-center font-mono text-xs">
                    {late.kind === "percent" ? `${late.amount / 100}%` : <Money p={late.amount} />}
                  </td>
                  <td className="text-center text-xs">
                    {late.kind === "per_day" ? "Per day late" : late.kind === "percent" ? "% of bill" : "Flat fee"}
                  </td>
                  <td className="text-center text-xs text-gray-600">
                    {late.graceDays > 0 ? `${late.graceDays} grace days` : "Immediate"}
                  </td>
                  <td className="text-center text-xs text-gray-500">
                    Overdue bills
                  </td>
                  <td className="text-right">
                    <span className="text-[10px] text-gray-400 italic" title="Auto-applied to all classes when amount > 0">
                      Auto rule
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Right: Would-be printed receipt format based on this class */}
        <div className="sticky top-4">
          <Card
            title={`${cls.name} receipt format preview`}
            actions={
              <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink border border-accent/20">
                ● {cls.name} preview
              </span>
            }
          >
            <div className="space-y-2">
              <div className="text-[11px] text-gray-500">
                Live print receipt format for <strong>{cls.name}</strong> students ({items.length + (isLateActive ? 1 : 0)} head{items.length + (isLateActive ? 1 : 0) === 1 ? "" : "s"} active):
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4 overflow-x-auto flex justify-center">
                <div className="w-full max-w-[420px] bg-white rounded-lg shadow-sm border border-gray-300 p-4 text-xs font-serif text-black select-none">
                  {/* Receipt Header */}
                  <div className="flex justify-between text-[10px] font-sans text-gray-600 mb-1.5 border-b border-gray-100 pb-1">
                    <span>Receipt No: <strong>RCT/{year.name}/001</strong></span>
                    <span>Date: <strong>{new Date().toLocaleDateString("en-IN")}</strong></span>
                  </div>

                  {logoSrc && (
                    <div className="flex justify-center mb-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoSrc} alt="School Logo" className="h-8 max-w-[120px] object-contain" />
                    </div>
                  )}

                  {/* Banner */}
                  <div className="bg-black text-white text-center font-bold text-xs uppercase tracking-wide py-1 px-2 mb-1 rounded-xs">
                    {settings.name?.trim() ? settings.name : "—"}
                  </div>

                  {/* School lines */}
                  <div className="text-center text-[10px] leading-tight text-gray-600 mb-2 font-sans space-y-0.5">
                    <div>{settings.headerSubtitle?.trim() ? settings.headerSubtitle : "—"}</div>
                    <div className="font-semibold">
                      {settings.udiseCode?.trim() ? `U-Dise Code- ${settings.udiseCode}` : "U-Dise Code- —"}
                    </div>
                    <div>{settings.address?.trim() ? settings.address : "—"}</div>
                  </div>

                  {/* Student Details Grid */}
                  <table className="w-full border-collapse border border-black text-[11px]">
                    <tbody>
                      <tr className="border-b border-black">
                        <td colSpan={4} className="p-1 font-sans text-[10px]">
                          <strong>Name :</strong> Sample Student
                        </td>
                      </tr>
                      <tr className="border-b border-black font-sans text-[10px]">
                        <td className="p-1 border-r border-black" style={{ width: "42%" }}>
                          <strong>Class :</strong> {cls.name}
                        </td>
                        <td className="p-1 border-r border-black" style={{ width: "24%" }}>
                          <strong>Sec-</strong> A
                        </td>
                        <td colSpan={2} className="p-1">
                          <strong>Roll :</strong> 1
                        </td>
                      </tr>
                      <tr className="bg-gray-100/90 font-bold text-center border-b border-black text-[10px]">
                        <td className="p-1 border-r border-black text-left">Details of Receipt</td>
                        <td className="p-1 border-r border-black">Period</td>
                        <td className="p-1 border-r border-black" style={{ width: "22%" }}>Rs.</td>
                        <td className="p-1" style={{ width: "12%" }}>P.</td>
                      </tr>

                      {receiptItems.length === 0 && !isLateActive ? (
                        <tr>
                          <td colSpan={4} className="p-3 text-center text-gray-400 font-sans text-[11px]">
                            No fee heads configured for {cls.name} yet
                          </td>
                        </tr>
                      ) : (
                        <>
                          {receiptItems.map(({ item, head }, i) => {
                            const isLast = !isLateActive && i === receiptItems.length - 1;
                            const rs = Math.floor(item.amount / 100);
                            const ps = String(item.amount % 100).padStart(2, "0");
                            const periodText =
                              item.frequency === "monthly"
                                ? "Apr"
                                : item.frequency === "quarterly"
                                ? "Q1 (Apr–Jun)"
                                : item.frequency === "half_yearly"
                                ? "Term 1"
                                : item.frequency === "annual"
                                ? "Annual"
                                : "One-time";

                            return (
                              <tr
                                key={item.id}
                                className={`border-b ${isLast ? "border-b-black" : "border-b-gray-300"} text-[11px]`}
                              >
                                <td className="px-1.5 py-1 border-r border-black truncate max-w-[150px]" title={head.name}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="truncate">{head.name}</span>
                                    {head.isRefundable && (
                                      <span className="shrink-0 rounded border border-black/70 px-1 py-0.5 text-[7px] leading-none font-sans font-semibold tracking-tight text-black">
                                        Refundable
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-1 py-1 border-r border-black text-center text-[10px] text-gray-500 font-sans">
                                  {periodText}
                                </td>
                                <td className="px-1.5 py-1 border-r border-black text-right tabular-nums">
                                  {rs}
                                </td>
                                <td className="px-1 py-1 text-right tabular-nums">
                                  {ps}
                                </td>
                              </tr>
                            );
                          })}

                          {isLateActive && late && (
                            <tr className="border-b border-b-black text-[11px]">
                              <td className="px-1.5 py-1 border-r border-black truncate max-w-[150px]" title={lateHead?.name || "Late Fee"}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="truncate">{lateHead?.name || "Late Fee"}</span>
                                  <span className="shrink-0 rounded border border-black/50 px-1 py-0.2 text-[8px] leading-none font-sans font-semibold text-gray-600">
                                    Auto
                                  </span>
                                </span>
                              </td>
                              <td className="px-1 py-1 border-r border-black text-center text-[10px] text-gray-500 font-sans">
                                Overdue
                              </td>
                              <td className="px-1.5 py-1 border-r border-black text-right tabular-nums">
                                {late.kind === "percent" ? `${late.amount / 100}%` : Math.floor(late.amount / 100)}
                              </td>
                              <td className="px-1 py-1 text-right tabular-nums">
                                {late.kind === "percent" ? "—" : String(late.amount % 100).padStart(2, "0")}
                              </td>
                            </tr>
                          )}
                        </>
                      )}

                      <tr className="font-bold border-t border-black bg-gray-50/50">
                        <td className="border-r border-black" />
                        <td className="p-1 border-r border-black text-right italic text-[10px]">Total</td>
                        <td className="p-1 border-r border-black text-right tabular-nums font-mono text-xs">
                          {totalRs}
                        </td>
                        <td className="p-1 text-right tabular-nums font-mono text-xs">{totalPs}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Words & Signatures */}
                  <div className="mt-2 text-[10px] text-gray-600 border-t border-gray-100 pt-1 font-sans">
                    <div className="flex gap-1">
                      <span className="font-semibold text-gray-700">Rupees:</span>
                      <span className="italic">{amountInWords(totalPaise)}</span>
                    </div>
                    <div className="mt-4 flex justify-between text-[10px] text-gray-700 pt-2 border-t border-dashed border-gray-200">
                      <span>Checked by</span>
                      <span className="text-right">Received by (Cashier)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
