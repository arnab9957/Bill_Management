import Link from "next/link";
import { revalidatePath } from "next/cache";
import { formatDate, payments } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";

async function clear(id: number) {
  "use server";
  const u = await requireRole("receiptsCancel");
  await payments.chequeCleared(u, id);
  revalidatePath("/cheques");
}
async function bounce(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("receiptsCancel");
  const r = await run(() => payments.chequeBounced(u, { chequeId: id, bounceCharge: fd.get("charge") || "0" }), "Marked bounced — payment reversed, guardian notified");
  revalidatePath("/cheques");
  return r;
}

export default async function Cheques({ searchParams }: { searchParams: Promise<{ status?: "pending" | "cleared" | "bounced" }> }) {
  await requireRole("receiptsCancel");
  const { status = "pending" } = await searchParams;
  const rows = await payments.listCheques(status);
  return (
    <div>
      <PageHeader title="Cheque register" actions={<>{(["pending", "cleared", "bounced"] as const).map((s) => <Link key={s} href={`?status=${s}`} className={`rounded-md border px-3 py-1.5 text-sm capitalize ${s === status ? "border-brand-600 text-brand-700" : "border-gray-300 bg-white"}`}>{s}</Link>)}</>} />
      <Card>
        {rows.length === 0 ? <Empty>No {status} cheques.</Empty> : (
          <table className="data">
            <thead><tr><th>Cheque</th><th>Bank</th><th>Dated</th><th>Student</th><th>Receipt</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c.id}>
                <td>{r.c.chequeNo}</td><td>{r.c.bank}</td><td>{formatDate(r.c.chequeDate)}</td><td>{r.studentName} <span className="text-xs text-gray-500">{r.admissionNo}</span></td>
                <td><Link className="text-brand-700 hover:underline" href={`/receipts/${r.c.paymentId}`}>{r.receiptNo}</Link></td><td className="num"><Money p={r.amount} /></td><td><Badge>{r.c.status}</Badge></td>
                <td>{r.c.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={clear.bind(null, r.c.id)}><button className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-700">Cleared</button></form>
                    <ActionForm action={bounce.bind(null, r.c.id)} className="flex items-center gap-1">
                      <input name="charge" placeholder="Charge ₹" className="w-20 text-xs" defaultValue="0" />
                      <Submit variant="danger" confirm="Mark this cheque as bounced? The payment will be reversed.">Bounced</Submit>
                    </ActionForm>
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
