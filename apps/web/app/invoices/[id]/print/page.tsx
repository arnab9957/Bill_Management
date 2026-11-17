import { notFound } from "next/navigation";
import { billing, getSettings, schoolLogoDataUri } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";
import { InvoiceSheet } from "@/components/invoice-sheet";

export const dynamic = "force-dynamic";

export default async function InvoicePrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  await requireRole("students");
  const { id } = await params;
  const { auto } = await searchParams;
  const [d, s] = await Promise.all([billing.getInvoice(Number(id)), getSettings()]);
  if (!d) notFound();
  const logoSrc = (await schoolLogoDataUri()) ?? undefined;
  return (
    <div className="flex justify-center bg-gray-100 p-4 print:bg-white print:p-0">
      <div>
        <PrintControls auto={auto === "1"} />
        <InvoiceSheet d={d} s={s} logoSrc={logoSrc} />
      </div>
    </div>
  );
}
