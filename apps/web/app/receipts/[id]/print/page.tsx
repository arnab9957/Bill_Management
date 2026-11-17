import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { amountInWords, formatINR, getSettings, payments, schoolLogoDataUri } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";
import { SchoolSheet } from "@/components/school-sheet";

export const dynamic = "force-dynamic";

async function markPrinted(id: number) {
  "use server";
  await requireRole("collect");
  await payments.markPrinted(id);
}

/** The fee receipt in the school's own paper format (see components/school-sheet.tsx). */
export default async function ReceiptPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; auto?: string }> }) {
  await requireRole("students");
  const { id } = await params;
  const { format = "a5" } = await searchParams;
  const r = await payments.getReceipt(Number(id));
  if (!r) notFound();
  const s = await getSettings();
  const duplicate = r.p.printCount > 0;
  const cancelled = r.p.status === "cancelled";
  const thermal = format === "thermal";
  const qr = await QRCode.toDataURL(`RCPT|${r.p.receiptNo}|${r.p.amount}|${r.p.date}|${r.student.admissionNo}`, { margin: 0, width: 110 });
  const mode = r.p.mode.replace("_", " ");
  const logoSrc = (await schoolLogoDataUri()) ?? undefined;

  return (
    <div className="flex justify-center overflow-x-auto bg-gray-100 p-4 print:bg-white print:p-0">
      <div>
        <PrintControls onPrint={markPrinted.bind(null, r.p.id)} auto={!duplicate} current={format}
          formats={[{ key: "a5", label: "A5" }, { key: "thermal", label: "80mm thermal" }]} />
        <SchoolSheet
          title="Receipt" school={s} number={r.p.receiptNo} date={r.p.date} logoSrc={logoSrc}
          student={{ name: r.student.name, className: r.klass.className, sectionName: r.klass.sectionName, rollNo: r.klass.rollNo }}
          rows={r.printRows} total={r.printTotal} words={amountInWords(r.printTotal)}
          signRightName={r.cashier} compact={thermal}
          watermark={cancelled ? "CANCELLED" : duplicate ? "DUPLICATE" : undefined}
          notes={<>
            Paid by <span className="capitalize">{mode}</span>
            {r.cheque ? ` · Cheque ${r.cheque.chequeNo}, ${r.cheque.bank} (subject to realisation)` : r.p.referenceNo ? ` · Ref ${r.p.referenceNo}` : ""}
            <br />Balance due after this receipt: {formatINR(r.outstanding)}
            {cancelled && <><br /><b>Cancelled: {r.p.cancelReason}</b></>}
          </>}
          images={[{ src: qr, alt: "verification QR", size: thermal ? 11 : 13 }]}
        />
      </div>
    </div>
  );
}
