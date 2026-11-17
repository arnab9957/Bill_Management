import QRCode from "qrcode";
import { amountInWords, billing, formatDMY, formatINR, getSettings } from "@sb/core";
import { SchoolSheet } from "@/components/school-sheet";

type InvoiceData = NonNullable<Awaited<ReturnType<typeof billing.getInvoice>>>;
type Settings = Awaited<ReturnType<typeof getSettings>>;

/** One printable fee bill in the school's own paper format. Used by the single-bill and bulk print pages. */
export async function InvoiceSheet({ d, s, breakAfter, logoSrc }: { d: InvoiceData; s: Settings; breakAfter?: boolean; logoSrc?: string }) {
  const { inv } = d;
  // UPI QR with the exact amount pre-filled, generated offline from the school's UPI ID.
  const upi = s.upiId && inv.balance > 0
    ? await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.name)}&am=${(inv.balance / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.invoiceNo)}`, { margin: 0, width: 120 })
    : null;
  const scan = await QRCode.toDataURL(`INV|${inv.invoiceNo}|${d.student.admissionNo}`, { margin: 0, width: 90 });

  return (
    <SchoolSheet
      title="Bill" school={s} number={inv.invoiceNo} date={inv.issueDate} breakAfter={breakAfter} logoSrc={logoSrc}
      student={{ name: d.student.name, className: d.klass.className, sectionName: d.klass.sectionName, rollNo: d.klass.rollNo }}
      rows={d.printRows} total={d.printTotal} words={amountInWords(d.printTotal)}
      signRight="Authorised signature"
      watermark={inv.status === "cancelled" ? "CANCELLED" : undefined}
      notes={<>
        <b>Due date: {formatDMY(inv.dueDate)}</b>
        {inv.paid > 0 && <> · Paid: {formatINR(inv.paid)}</>}
        {inv.balance !== inv.net && <> · Balance payable: <b>{formatINR(inv.balance)}</b></>}
        {inv.discount + inv.credited > 0 && <><br />After concession / credit of {formatINR(inv.discount + inv.credited)}</>}
        {upi && <><br />Scan to pay by UPI ({s.upiId}) · quote the bill no. and share the UTR</>}
        <br />Late fee applies after the due date as per school policy. Please ignore if already paid.
      </>}
      images={[...(upi ? [{ src: upi, alt: "UPI QR", size: 17 }] : []), { src: scan, alt: "bill QR", size: 11 }]}
    />
  );
}
