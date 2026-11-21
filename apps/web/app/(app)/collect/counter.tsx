"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatINR, formatDate } from "@sb/core/src/money-dates-client";
import { collectAction, loadStudentAction, searchAction } from "./actions";
import { Avatar } from "@/components/student-photo";
import { buttonClass, Empty, Notice, panelClass, SectionHeading } from "@/components/ui";

type Found = Awaited<ReturnType<typeof searchAction>>[number];
type Loaded = NonNullable<Awaited<ReturnType<typeof loadStudentAction>>>;
const MODES = [
  { v: "cash", l: "Cash", k: "1" }, { v: "upi", l: "UPI", k: "2" }, { v: "cheque", l: "Cheque", k: "3" },
  { v: "card", l: "Card", k: "4" }, { v: "bank_transfer", l: "Bank transfer", k: "5" }, { v: "dd", l: "DD", k: "6" },
] as const;
type Mode = (typeof MODES)[number]["v"];

/** Rupee string → paise without floats. */
function toPaise(s: string): number | null {
  const t = s.replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w = "0", f = ""] = t.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

export function Counter({ today, initialStudentId }: { today: string; initialStudentId?: number }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [sel, setSel] = useState(0);
  const [student, setStudent] = useState<Loaded | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("cash");
  const [ref, setRef] = useState({ referenceNo: "", bank: "", chequeNo: "", chequeDate: "" });
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string; paymentId?: number } | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const load = useCallback((id: number) => {
    start(async () => {
      const s = await loadStudentAction(id);
      setStudent(s);
      setResults([]);
      setAlloc({});
      setManual(false);
      if (s) setAmount(s.total ? (s.total / 100).toString() : "");
      setTimeout(() => amountRef.current?.select(), 30);
    });
  }, []);

  useEffect(() => { if (initialStudentId) load(initialStudentId); }, [initialStudentId, load]);

  useEffect(() => {
    if (q.trim().length < 1) { setResults([]); return; }
    const t = setTimeout(() => start(async () => { setResults(await searchAction(q)); setSel(0); }), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Global: F2 / "/" focuses search
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "F2" || (e.key === "/" && document.activeElement?.tagName !== "INPUT")) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const paise = toPaise(amount);
  const manualTotal = useMemo(() => Object.values(alloc).reduce((a, v) => a + (toPaise(v) ?? 0), 0), [alloc]);

  function submit() {
    if (!student || !paise) { setMsg({ ok: false, text: "Enter a valid amount" }); return; }
    const allocations = manual ? Object.entries(alloc).map(([id, v]) => ({ invoiceLineId: Number(id), amount: toPaise(v) ?? 0 })).filter((a) => a.amount > 0) : undefined;
    start(async () => {
      const r = await collectAction({
        studentId: student.id, amount: paise, mode, date: today,
        referenceNo: ref.referenceNo || undefined, bank: ref.bank || undefined, chequeNo: ref.chequeNo || undefined, chequeDate: ref.chequeDate || undefined,
        allocations,
      });
      if (r?.ok) {
        const d = r.data as { paymentId: number; receiptNo: string; toWallet: number };
        setMsg({ ok: true, text: `${r.message}${d.toWallet ? ` · ${formatINR(d.toWallet)} kept as advance` : ""}`, paymentId: d.paymentId });
        window.open(`/receipts/${d.paymentId}/print`, "_blank", "noopener");
        setRef({ referenceNo: "", bank: "", chequeNo: "", chequeDate: "" });
        load(student.id);
      } else setMsg({ ok: false, text: r?.message ?? "Failed" + (r?.errors ? ": " + Object.values(r.errors).join(", ") : "") });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:gap-5">
      <div className="space-y-3">
        <div className="relative">
          <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="w-full text-base"
            placeholder="Name, admission no. or mobile  (F2)"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && results[sel]) { e.preventDefault(); load(results[sel]!.id); setQ(""); }
            }} />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-gray-200 bg-surface shadow-lg">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { load(r.id); setQ(""); }}
                    className={`flex w-full justify-between px-3 py-2 text-left text-sm ${i === sel ? "bg-gray-100 text-ink" : "hover:bg-gray-50"}`}>
                    <span><b>{r.name}</b> <span className="text-gray-500">{r.admissionNo} · {r.className}{r.sectionName ? "-" + r.sectionName : ""}</span></span>
                    <span className="tabular-nums text-red-700">{r.outstanding ? formatINR(r.outstanding) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {student && (
          <div className={`${panelClass} p-5`}>
            <div className="flex gap-3">
              <Avatar studentId={student.id} name={student.name} photoPath={student.photoPath} size={72} />
              <div className="min-w-0">
                <a href={`/students/${student.id}`} className="font-semibold hover:underline">{student.name}</a>
                <div className="text-sm text-gray-600">{student.admissionNo} · Class {student.className}{student.sectionName ? "-" + student.sectionName : ""}</div>
                <div className="truncate text-xs text-gray-500">{student.guardian}</div>
              </div>
            </div>
            {student.status !== "active" && <div className="mt-3"><Notice tone="warn">Student status: {student.status}</Notice></div>}
            {student.siblings.length > 0 && (
              <div className="mt-2 text-xs text-gray-600">Siblings: {student.siblings.map((s) => (
                <button key={s.id} type="button" className="mr-2 text-ink hover:underline" onClick={() => load(s.id)}>{s.name} ({s.className})</button>
              ))}</div>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">Total due</dt><dd className="text-right font-semibold tabular-nums text-red-700">{formatINR(student.total)}</dd>
              <dt className="text-gray-500">Advance (wallet)</dt><dd className="text-right tabular-nums">{formatINR(student.wallet)}</dd>
            </dl>
            <SectionHeading className="mt-4">Last payments</SectionHeading>
            <ul className="mt-1 space-y-1 text-xs">
              {student.recent.length === 0 && <li className="text-gray-400">None</li>}
              {student.recent.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <a className="text-ink hover:underline" href={`/receipts/${p.id}/print`} target="_blank">{p.receiptNo}</a>
                  <span className={p.status === "cancelled" ? "text-gray-400 line-through" : ""}>{formatDate(p.date)} · {formatINR(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        {!student ? (
          <Empty>Search for a student to begin. Use ↑ ↓ and Enter.</Empty>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <div className={panelClass}>
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                <h2 className="text-sm font-semibold">Pending dues</h2>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />Allocate head-wise</label>
              </div>
              {student.lines.length === 0 ? <p className="p-4 text-sm text-gray-500">No pending dues. Any amount collected is kept as advance.</p> : (
                <table className="data">
                  <thead><tr><th>Bill</th><th>Head</th><th>Due</th><th className="num">Balance</th>{manual && <th className="num">Pay</th>}</tr></thead>
                  <tbody>
                    {student.lines.map((l) => (
                      <tr key={l.invoiceLineId}>
                        <td className="whitespace-nowrap text-xs">{l.invoiceNo}</td>
                        <td>{l.description}</td>
                        <td className={`whitespace-nowrap ${l.dueDate < today ? "text-red-700" : ""}`}>{formatDate(l.dueDate)}</td>
                        <td className="num">{formatINR(l.balance)}</td>
                        {manual && <td className="num"><input className="w-24 text-right" value={alloc[l.invoiceLineId] ?? ""} onChange={(e) => setAlloc({ ...alloc, [l.invoiceLineId]: e.target.value })} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={`${panelClass} grid gap-4 p-5 sm:grid-cols-2`}>
              <label className="flex flex-col gap-1">Amount received (₹)
                <input ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="text-lg font-semibold"
                  onKeyDown={(e) => { if (e.altKey) { const m = MODES.find((x) => x.k === e.key); if (m) { e.preventDefault(); setMode(m.v); } } }} />
                {manual && <span className="text-xs text-gray-500">Allocated {formatINR(manualTotal)}; rest {paise != null ? formatINR(Math.max(0, paise - manualTotal)) : "-"} to advance</span>}
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-gray-700">Mode <span className="text-xs text-gray-400">(Alt+1…6)</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {MODES.map((m) => (
                    <button key={m.v} type="button" onClick={() => setMode(m.v)}
                      className={buttonClass(mode === m.v ? "primary" : "secondary", "sm")}>{m.l}</button>
                  ))}
                </div>
              </div>
              {(mode === "upi" || mode === "card" || mode === "bank_transfer") && (
                <label className="flex flex-col gap-1">Reference / UTR no.<input value={ref.referenceNo} onChange={(e) => setRef({ ...ref, referenceNo: e.target.value })} required /></label>
              )}
              {(mode === "cheque" || mode === "dd") && (<>
                <label className="flex flex-col gap-1">{mode === "dd" ? "DD" : "Cheque"} no.<input value={ref.chequeNo} onChange={(e) => setRef({ ...ref, chequeNo: e.target.value })} required /></label>
                <label className="flex flex-col gap-1">Bank<input value={ref.bank} onChange={(e) => setRef({ ...ref, bank: e.target.value })} required /></label>
                <label className="flex flex-col gap-1">Date on cheque<input type="date" value={ref.chequeDate} data-ahead="180" title="Cheques are valid for 3 months; post-dated up to 6 months" onChange={(e) => setRef({ ...ref, chequeDate: e.target.value })} /></label>
              </>)}
              <div className="flex items-end sm:col-span-2">
                <button disabled={pending || !paise} className={`${buttonClass("primary")} w-full sm:w-auto`}>
                  {pending ? "Saving…" : `Save & print receipt${paise ? " · " + formatINR(paise) : ""}`}
                </button>
              </div>
            </div>
            {msg && (
              <Notice tone={msg.ok ? "ok" : "error"}>{msg.text} {msg.paymentId && <a className="ml-2 underline" href={`/receipts/${msg.paymentId}/print`} target="_blank">Print again</a>}</Notice>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
