import Link from "next/link";
import { can, formatINR, getSettings, payments, today } from "@sb/core";
import { closeDayAction } from "./actions";
import { denominations } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, Money, PageHeader, Stat } from "@/components/ui";

export default async function DayBook({ searchParams }: { searchParams: Promise<{ date?: string; mine?: string }> }) {
  const user = await requireRole("dayClose");
  const sp = await searchParams;
  const date = sp.date ?? today();
  // Cashiers only see their own counter; accountants/admins see everyone unless they filter.
  const onlyMine = user.role === "CASHIER" || sp.mine === "1";
  const book = await payments.dayBook(date, onlyMine ? user.id : undefined);
  const closing = (await getSettings()).dayCloseEnabled; // optional cash-counter closing
  const myClose = book.closes.find((c) => c.c.userId === user.id);
  const myCash = book.rows.filter((r) => r.p.receivedBy === user.id && r.p.status === "valid" && r.p.mode === "cash").reduce((a, r) => a + r.p.amount, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Day book" subtitle={`${date} · everything collected that day`} actions={<>
        <form className="toolbar"><input type="date" name="date" defaultValue={date} />{user.role !== "CASHIER" && <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} />Mine only</label>}<button className="filter-button">Show</button></form>
        {can(user.role, "reports") && <LinkButton href={`/api/export/daybook?date=${date}`}>Export</LinkButton>}
      </>} />
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Stat label="Total collected" value={formatINR(book.total)} sub={`${book.rows.length - book.cancelled} receipts`} />
        {Object.entries(book.byMode).map(([m, v]) => <Stat key={m} label={m.replace("_", " ")} value={formatINR(v)} />)}
        {book.cancelled > 0 && <Stat label="Cancelled" value={book.cancelled} tone="red" />}
      </div>
      <Card title="Receipts">
        <table className="data">
          <thead><tr><th>Receipt</th><th>Student</th><th>Mode</th><th>Cashier</th><th>Status</th><th className="num">Amount</th></tr></thead>
          <tbody>{book.rows.map((r) => (
            <tr key={r.p.id}><td><Link className="text-ink hover:underline" href={`/receipts/${r.p.id}`}>{r.p.receiptNo}</Link></td>
              <td>{r.studentName} <span className="text-xs text-gray-500">{r.admissionNo}</span></td><td className="capitalize">{r.p.mode.replace("_", " ")}</td>
              <td>{r.cashier}</td><td><Badge>{r.p.status}</Badge></td><td className="num"><Money p={r.p.amount} /></td></tr>
          ))}</tbody>
        </table>
      </Card>
      {closing && (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Close my counter">
          {myClose ? (
            <p className="text-sm">Closed at {myClose.c.closedAt.toLocaleTimeString("en-IN")}. System cash <Money p={myClose.c.systemCash} />, counted <Money p={myClose.c.countedCash} />, difference <b><Money p={myClose.c.difference} /></b>. Entries for this day are locked.</p>
          ) : (
            <ActionForm action={closeDayAction}>
              <input type="hidden" name="date" value={date} />
              <p className="mb-3 text-sm text-gray-600">Count the cash drawer. Expected cash: <b><Money p={myCash} /></b></p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {denominations.map((d) => <label key={d} className="flex flex-col gap-1 text-xs">₹{d} ×<input name={`d${d}`} type="number" min={0} defaultValue={0} className="w-full" /></label>)}
              </div>
              <div className="mt-3"><Submit confirm="Close the day? You won't be able to collect more for this date.">Close day</Submit></div>
            </ActionForm>
          )}
        </Card>
        <Card title="Counter closings">
          {book.closes.length === 0 ? <p className="text-sm text-gray-500">No counters closed yet.</p> : (
            <table className="data"><thead><tr><th>Cashier</th><th className="num">System cash</th><th className="num">Counted</th><th className="num">Difference</th></tr></thead>
              <tbody>{book.closes.map(({ c, name }) => <tr key={c.id}><td>{name}</td><td className="num"><Money p={c.systemCash} /></td><td className="num"><Money p={c.countedCash} /></td><td className="num"><Money p={c.difference} className={c.difference ? "font-semibold text-red-700" : ""} /></td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      )}
    </div>
  );
}
