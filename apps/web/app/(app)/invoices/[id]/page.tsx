import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { billing, formatDate, periodLabel } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Money, PageHeader } from "@/components/ui";

async function cancel(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("billing");
  const r = await run(() => billing.cancelInvoice(u, { invoiceId: id, reason: fd.get("reason") }), "Bill cancelled with a credit note");
  revalidatePath(`/invoices/${id}`);
  return r;
}
async function credit(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("billing");
  const r = await run(() => billing.issueCreditNote(u, { ...formObject(fd), invoiceId: id }), (x) => `Credit note ${x.creditNoteNo} issued`);
  revalidatePath(`/invoices/${id}`);
  return r;
}

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("billing");
  const id = Number((await params).id);
  const d = await billing.getInvoice(id);
  if (!d) notFound();
  const { inv } = d;
  return (
    <div className="space-y-4">
      <PageHeader title={`Bill ${inv.invoiceNo}`} subtitle={<><Link className="text-brand-700 hover:underline" href={`/students/${inv.studentId}`}>{d.student.name}</Link> · {d.className} · {periodLabel(inv.period)} · <Badge>{inv.status}</Badge></>}
        actions={<LinkButton variant="primary" href={`/invoices/${id}/print?auto=1`} target="_blank">🖨 Print bill</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Lines" className="lg:col-span-2">
          <table className="data">
            <thead><tr><th>Particulars</th><th className="num">Amount</th><th className="num">Concession</th><th className="num">Credit</th><th className="num">Net</th><th className="num">Paid</th></tr></thead>
            <tbody>{d.lines.map((l) => (
              <tr key={l.id}><td>{l.description}</td><td className="num"><Money p={l.amount} /></td><td className="num"><Money p={l.discount} /></td><td className="num"><Money p={l.credited} /></td><td className="num"><Money p={l.net} /></td><td className="num"><Money p={l.paid} /></td></tr>
            ))}</tbody>
            <tfoot><tr className="font-semibold"><td>Total</td><td className="num"><Money p={inv.gross + inv.lateFee} /></td><td className="num"><Money p={inv.discount} /></td><td className="num"><Money p={inv.credited} /></td><td className="num"><Money p={inv.net} /></td><td className="num"><Money p={inv.paid} /></td></tr></tfoot>
          </table>
          <div className="mt-3 text-right text-lg">Balance <b><Money p={inv.balance} /></b> · due {formatDate(inv.dueDate)}</div>
          {inv.cancelReason && <p className="mt-2 text-sm text-gray-600">Note: {inv.cancelReason}</p>}
        </Card>
        <div className="space-y-4">
          <Card title="Payments applied">
            {d.allocations.length === 0 ? <p className="text-sm text-gray-500">None</p> : (
              <ul className="space-y-1 text-sm">{d.allocations.map(({ a, receiptNo, date }) => (
                <li key={a.id} className={`flex justify-between ${a.reversedAt ? "text-gray-400 line-through" : ""}`}><Link className="text-brand-700 hover:underline" href={`/receipts/${a.paymentId}`}>{receiptNo}</Link><span>{formatDate(date)} · <Money p={a.amount} /></span></li>
              ))}</ul>
            )}
            {d.creditNotes.length > 0 && <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-sm">{d.creditNotes.map((c) => <li key={c.id}>{c.creditNoteNo}: <Money p={c.amount} /> — {c.reason}</li>)}</ul>}
          </Card>
          {inv.status !== "cancelled" && inv.balance > 0 && (
            <Card title="Credit note (reduce bill)">
              <ActionForm action={credit.bind(null, id)} className="grid gap-2">
                <input name="amount" placeholder="Amount ₹" inputMode="decimal" required /><FieldError name="amount" />
                <input name="reason" placeholder="Reason" required /><FieldError name="reason" />
                <Submit variant="secondary" confirm="Issue a credit note?">Issue credit note</Submit>
              </ActionForm>
            </Card>
          )}
          {inv.status !== "cancelled" && inv.paid === 0 && (
            <Card title="Cancel bill">
              <ActionForm action={cancel.bind(null, id)} className="grid gap-2">
                <input name="reason" placeholder="Reason (required)" required /><FieldError name="reason" />
                <Submit variant="danger" confirm="Cancel this bill? This cannot be undone.">Cancel bill</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
