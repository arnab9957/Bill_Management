import { billing, getSettings } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { PrintControls } from "@/components/print-controls";
import { InvoiceSheet } from "@/components/invoice-sheet";

export const dynamic = "force-dynamic";
const MAX = 300;

/** Bulk print: every bill matching the Bills page filters, one A5 page each. */
export default async function PrintAll({ searchParams }: { searchParams: Promise<{ q?: string; period?: string; classId?: string; status?: string }> }) {
  await requireRole("billing");
  const sp = await searchParams;
  const { year } = await getWorkingYear();
  const rows = await billing.listInvoices({ q: sp.q, period: sp.period, classId: sp.classId ? Number(sp.classId) : undefined, status: sp.status, limit: MAX, yearId: year.id });
  const [s, bills] = await Promise.all([
    getSettings(),
    Promise.all(rows.slice().reverse().map((r) => billing.getInvoice(r.inv.id))),
  ]);
  const list = bills.filter((b) => b !== null);
  return (
    <div className="bg-gray-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-[148mm]">
        <PrintControls />
        <p className="no-print mb-3 text-sm text-gray-600">
          {list.length} bill(s){list.length === MAX ? ` — showing the first ${MAX}; narrow the filter to print the rest` : ""}. Each bill prints on its own A5 page.
        </p>
      </div>
      <div className="space-y-4 print:space-y-0">
        {list.length === 0 ? <p className="text-center text-sm text-gray-500">No bills match these filters.</p> : list.map((d) => <InvoiceSheet key={d.inv.id} d={d} s={s} />)}
      </div>
    </div>
  );
}
