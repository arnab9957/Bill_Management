import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { amountInWords, formatDate, formatINR, getSettings, payments } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";

export const dynamic = "force-dynamic";

async function markPrinted(id: number) {
  "use server";
  await requireRole("collect");
  await payments.markPrinted(id);
}

export default async function ReceiptPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string; auto?: string }> }) {
  await requireRole("students");
  const { id } = await params;
  const { format = "a5" } = await searchParams;
  const r = await payments.getReceipt(Number(id));
  if (!r) notFound();
  const s = await getSettings();
  const duplicate = r.p.printCount > 0;
  const cancelled = r.p.status === "cancelled";
  const qr = await QRCode.toDataURL(`RCPT|${r.p.receiptNo}|${r.p.amount}|${r.p.date}|${r.student.admissionNo}`, { margin: 0, width: 110 });
  const thermal = format === "thermal";
  const lines = r.lines.filter((l) => !l.reversedAt || cancelled);
  const advance = r.p.amount - lines.reduce((a, l) => a + l.amount, 0);

  return (
    <div className="flex justify-center bg-gray-100 p-4 print:bg-white print:p-0">
      <div>
        <PrintControls onPrint={markPrinted.bind(null, r.p.id)} auto={!duplicate} current={format}
          formats={[{ key: "a5", label: "A5" }, { key: "thermal", label: "80mm thermal" }]} />
        <div className={`print-area relative bg-white p-5 shadow ${thermal ? "paper-thermal page-thermal p-2" : "paper-a5 page-a5"}`}>
          {(duplicate || cancelled) && <div className="watermark">{cancelled ? "CANCELLED" : "DUPLICATE"}</div>}
          <div className="text-center">
            <div className={`${thermal ? "text-sm" : "text-lg"} font-bold`}>{s.name}</div>
            <div className="text-xs text-gray-600">{s.address}</div>
            <div className="text-xs text-gray-600">{s.phone}{s.email ? ` · ${s.email}` : ""}</div>
            <div className="mt-2 inline-block border-y border-gray-800 px-3 text-sm font-semibold tracking-widest">FEE RECEIPT</div>
          </div>
          <table className="mt-3 w-full text-xs">
            <tbody>
              <tr><td className="text-gray-500">Receipt no.</td><td className="font-semibold">{r.p.receiptNo}</td></tr>
              <tr><td className="text-gray-500">Date</td><td>{formatDate(r.p.date)}</td></tr>
              <tr><td className="text-gray-500">Student</td><td className="font-semibold">{r.student.name}</td></tr>
              <tr><td className="text-gray-500">Adm. no. / Class</td><td>{r.student.admissionNo} · {r.className}{r.sectionName ? "-" + r.sectionName : ""}</td></tr>
            </tbody>
          </table>
          <table className="mt-3 w-full border-t border-gray-800 text-xs">
            <thead><tr className="border-b border-gray-300"><th className="py-1 text-left">Particulars</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => <tr key={i}><td className="py-0.5">{l.description}</td><td className="py-0.5 text-right tabular-nums">{formatINR(l.amount, { symbol: false })}</td></tr>)}
              {advance > 0 && <tr><td className="py-0.5">Advance (adjusted against future bills)</td><td className="py-0.5 text-right tabular-nums">{formatINR(advance, { symbol: false })}</td></tr>}
              <tr className="border-t border-gray-800 font-semibold"><td className="py-1">Total received</td><td className="py-1 text-right tabular-nums">{formatINR(r.p.amount)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs italic">{amountInWords(r.p.amount)}</p>
          <p className="mt-1 text-xs">Mode: <span className="capitalize">{r.p.mode.replace("_", " ")}</span>
            {r.cheque ? ` · Cheque ${r.cheque.chequeNo}, ${r.cheque.bank} (subject to realisation)` : r.p.referenceNo ? ` · Ref ${r.p.referenceNo}` : ""}</p>
          <p className="mt-1 text-xs">Balance outstanding after this receipt: <b>{formatINR(r.outstanding)}</b></p>
          {cancelled && <p className="mt-1 text-xs font-semibold text-red-700">Cancelled: {r.p.cancelReason}</p>}
          <div className="mt-4 flex items-end justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="verification QR" className={thermal ? "h-16 w-16" : "h-20 w-20"} />
            <div className="text-right text-xs">
              <div className="mt-6 border-t border-gray-500 pt-0.5">Received by {r.cashier}</div>
              <div className="text-[10px] text-gray-500">Computer-generated receipt</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
