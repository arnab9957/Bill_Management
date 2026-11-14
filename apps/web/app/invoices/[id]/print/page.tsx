import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { amountInWords, billing, formatDate, formatINR, getSettings, periodLabel } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { PrintControls } from "@/components/print-controls";

export const dynamic = "force-dynamic";

export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("students");
  const { id } = await params;
  const d = await billing.getInvoice(Number(id));
  if (!d) notFound();
  const s = await getSettings();
  const { inv } = d;
  // UPI QR with the exact amount pre-filled — generated offline from the school's UPI ID.
  const upi = s.upiId && inv.balance > 0
    ? await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.name)}&am=${(inv.balance / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.invoiceNo)}`, { margin: 0, width: 120 })
    : null;
  const scan = await QRCode.toDataURL(`INV|${inv.invoiceNo}|${d.student.admissionNo}`, { margin: 0, width: 90 });

  return (
    <div className="flex justify-center bg-gray-100 p-4 print:bg-white print:p-0">
      <div>
        <PrintControls />
        <div className="print-area paper-a5 page-a5 relative bg-white p-6 shadow">
          {inv.status === "cancelled" && <div className="watermark">CANCELLED</div>}
          <div className="text-center">
            <div className="text-lg font-bold">{s.name}</div>
            <div className="text-xs text-gray-600">{s.address}</div>
            <div className="text-xs text-gray-600">{s.phone}{s.email ? ` · ${s.email}` : ""}</div>
            <div className="mt-2 inline-block border-y border-gray-800 px-3 text-sm font-semibold tracking-widest">FEE BILL</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 text-xs">
            <div><span className="text-gray-500">Bill no.</span> <b>{inv.invoiceNo}</b></div>
            <div className="text-right"><span className="text-gray-500">Period</span> {periodLabel(inv.period)}</div>
            <div><span className="text-gray-500">Student</span> <b>{d.student.name}</b></div>
            <div className="text-right"><span className="text-gray-500">Issued</span> {formatDate(inv.issueDate)}</div>
            <div><span className="text-gray-500">Adm. no.</span> {d.student.admissionNo} · {d.className}{d.sectionName ? "-" + d.sectionName : ""}</div>
            <div className="text-right font-semibold"><span className="text-gray-500">Due by</span> {formatDate(inv.dueDate)}</div>
          </div>
          <table className="mt-3 w-full border-t border-gray-800 text-xs">
            <thead><tr className="border-b border-gray-300"><th className="py-1 text-left">Particulars</th><th className="text-right">Amount</th><th className="text-right">Concession</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.id}><td className="py-0.5">{l.description}</td><td className="text-right tabular-nums">{formatINR(l.amount, { symbol: false })}</td>
                  <td className="text-right tabular-nums">{l.discount + l.credited ? formatINR(l.discount + l.credited, { symbol: false }) : ""}</td><td className="text-right tabular-nums">{formatINR(l.net, { symbol: false })}</td></tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-800">
              <tr><td className="pt-1" colSpan={3}>Total</td><td className="pt-1 text-right font-semibold tabular-nums">{formatINR(inv.net)}</td></tr>
              {inv.paid > 0 && <tr><td colSpan={3}>Paid / adjusted</td><td className="text-right tabular-nums">{formatINR(inv.paid)}</td></tr>}
              <tr className="text-sm"><td colSpan={3} className="font-semibold">Amount payable</td><td className="text-right font-bold tabular-nums">{formatINR(inv.balance)}</td></tr>
            </tfoot>
          </table>
          <p className="mt-1 text-xs italic">{amountInWords(inv.balance)}</p>
          <div className="mt-4 flex items-end justify-between gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scan} alt="bill QR" className="h-16 w-16" />
            {upi && (
              <div className="flex items-center gap-2 text-xs">
                <div className="text-right">Scan to pay by UPI<br /><span className="text-gray-500">{s.upiId}</span><br />Quote bill no. & share UTR</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={upi} alt="UPI QR" className="h-24 w-24" />
              </div>
            )}
          </div>
          <p className="mt-3 text-[10px] text-gray-500">Late fee applies after the due date as per school policy. Please ignore if already paid.</p>
        </div>
      </div>
    </div>
  );
}
