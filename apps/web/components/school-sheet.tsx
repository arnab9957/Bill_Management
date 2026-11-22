import type { ReactNode } from "react";
import { formatDMY, rupeesAndPaise, type PrintRow } from "@sb/core";

export interface SheetSchool {
  name: string;
  address: string;
  headerSubtitle: string;
  udiseCode: string;
  registrationNote: string;
}

export interface SchoolSheetProps {
  title: "Receipt" | "Bill";
  school: SheetSchool;
  number: string;
  /** ISO date, printed as 13-11-2026 */
  date: string;
  student: { name: string; className: string; sectionName: string | null; rollNo: string | null };
  rows: PrintRow[];
  /** paise */
  total: number;
  words: string;
  signLeft?: string;
  signRight?: string;
  /** small caption under the right signature, e.g. the cashier's name */
  signRightName?: string;
  watermark?: string;
  /** 80 mm thermal roll: smaller, and only the rows that have an amount */
  compact?: boolean;
  /** small print under the signatures: payment mode, balance, due date … */
  notes?: ReactNode;
  images?: { src: string; alt: string; size: number }[];
  breakAfter?: boolean;
  /** the school's logo as a data address (optional) */
  logoSrc?: string;
}

/**
 * The school's own paper format for fee receipts and bills: school banner and registration lines,
 * a Name / Class / Sec / Roll box, a fixed grid of fee heads with Rs. and P. columns, the total,
 * the amount in words, and Checked by / Received by.
 */
export function SchoolSheet(p: SchoolSheetProps) {
  const rows = p.compact ? p.rows.filter((r) => r.amount !== 0) : p.rows;
  const registration = p.school.registrationNote.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const total = rupeesAndPaise(p.total);
  return (
    <div className={`ss print-area mx-auto shadow print:shadow-none ${p.compact ? "ss-thermal page-thermal" : "page-ss"} ${p.breakAfter ? "break-after-page" : ""}`}>
      {p.watermark && <div className="watermark">{p.watermark}</div>}

      <div className="ss-top"><span>{p.title} No: {p.number}</span><span>Date: {formatDMY(p.date)}</span></div>
      {p.logoSrc && <img src={p.logoSrc} alt="" className="ss-logo" />}
      <div className="ss-banner">{p.school.name}</div>
      <div className="ss-lines">
        {p.school.headerSubtitle && <div>{p.school.headerSubtitle}</div>}
        {p.school.udiseCode && <div><b>U-Dise Code- {p.school.udiseCode}</b></div>}
        {registration.map((l, i) => <div key={i}>{l}</div>)}
        {p.school.address && <div><b>{p.school.address}</b></div>}
      </div>

      <table className="ss-grid">
        <colgroup><col style={{ width: "38%" }} /><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /><col style={{ width: "12%" }} /></colgroup>
        <tbody>
          <tr className="ss-name"><td colSpan={4}>Name : {p.student.name}</td></tr>
          <tr className="ss-class"><td>Class : {p.student.className}</td><td>Sec- {p.student.sectionName ?? ""}</td><td colSpan={2}>Roll : {p.student.rollNo ?? ""}</td></tr>
          <tr className="ss-th"><td>Details of {p.title}</td><td /><td>Rs.</td><td>P.</td></tr>
          {rows.map((r, i) => {
            const a = rupeesAndPaise(r.amount);
            return (
              <tr key={`${r.label}-${i}`} className={`ss-row${i === rows.length - 1 ? " ss-last" : ""}`}>
                <td>
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    <span>{r.label}</span>
                    {r.isRefundable && (
                      <span className="rounded border border-black/70 px-1 py-0.5 text-[6.5pt] leading-none font-sans font-semibold tracking-tight text-black print:border-black print:text-black">
                        Refundable
                      </span>
                    )}
                  </span>
                </td>
                <td className="ss-p">{r.period}</td>
                <td className="ss-n">{a.rs}</td>
                <td className="ss-n">{a.p}</td>
              </tr>
            );
          })}
          <tr className="ss-total"><td /><td className="ss-tl">Total</td><td className="ss-box">{total.rs}</td><td className="ss-box">{total.p}</td></tr>
        </tbody>
      </table>

      <div className="ss-words"><span>Rupees (in words)</span><span>{p.words}</span></div>
      <div className="ss-sign">
        <span>{p.signLeft ?? "Checked by"}</span>
        <span>{p.signRight ?? "Received by"}{p.signRightName && <small>{p.signRightName}</small>}</span>
      </div>

      {(p.notes || p.images?.length) && (
        <div className="ss-foot">
          <div>{p.notes}</div>
          <div className="flex items-end gap-2">
            {p.images?.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={im.src} alt={im.alt} style={{ width: `${im.size}mm`, height: `${im.size}mm` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
