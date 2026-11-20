import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { amountInWords, can, formatDate, payments } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Money, PageHeader } from "@/components/ui";

async function cancel(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("receiptsCancel");
  const r = await run(() => payments.cancelReceipt(u, { paymentId: id, reason: fd.get("reason") }), "Receipt cancelled; dues restored");
  revalidatePath(`/receipts/${id}`);
  return r;
}

export default async function ReceiptDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("students");
  const id = Number((await params).id);
  const r = await payments.getReceipt(id);
  if (!r) notFound();
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={`Receipt ${r.p.receiptNo}`} subtitle={<><Link className="text-ink hover:underline" href={`/students/${r.student.id}`}>{r.student.name}</Link> · {formatDate(r.p.date)} · <Badge>{r.p.status}</Badge></>}
        actions={<LinkButton href={`/receipts/${id}/print`} target="_blank">Print{r.p.printCount ? " duplicate" : ""}</LinkButton>} />
      <Card>
        <div className="text-2xl font-semibold"><Money p={r.p.amount} /></div>
        <div className="text-sm italic text-gray-600">{amountInWords(r.p.amount)}</div>
        <div className="mt-2 text-sm">Mode: <span className="capitalize">{r.p.mode.replace("_", " ")}</span>{r.p.referenceNo ? ` · Ref ${r.p.referenceNo}` : ""}{r.p.bank ? ` · ${r.p.bank}` : ""} · received by {r.cashier} · printed {r.p.printCount}×</div>
        {r.cheque && <div className="mt-1 text-sm">Cheque {r.cheque.chequeNo} dated {formatDate(r.cheque.chequeDate)} — <Badge>{r.cheque.status}</Badge></div>}
        {r.p.cancelReason && <div className="mt-2 text-sm text-red-700">Cancelled: {r.p.cancelReason}</div>}
        <table className="data mt-4">
          <thead><tr><th>Bill</th><th>Head</th><th className="num">Amount</th></tr></thead>
          <tbody>{r.lines.map((l, i) => <tr key={i} className={l.reversedAt ? "text-gray-400 line-through" : ""}><td>{l.invoiceNo}</td><td>{l.description}</td><td className="num"><Money p={l.amount} /></td></tr>)}</tbody>
        </table>
        {r.p.unallocated > 0 && <p className="mt-2 text-sm">Held as advance: <Money p={r.p.unallocated} /></p>}
      </Card>
      {r.p.status === "valid" && can(user.role, "receiptsCancel") && (
        <Card title="Cancel receipt">
          <p className="mb-2 text-sm text-gray-600">Cancelling reverses every allocation; the bills become due again. The receipt stays in the books marked CANCELLED.</p>
          <ActionForm action={cancel.bind(null, id)} className="flex flex-wrap gap-2">
            <input name="reason" placeholder="Reason (required)" className="flex-1" required />
            <Submit variant="danger" confirm="Cancel this receipt?">Cancel receipt</Submit>
            <FieldError name="reason" />
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
