import Link from "next/link";
import { addDays, formatDate, formatINR, ops, periodLabel, periodOf, reports, today } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { getWorkingYear } from "@/lib/year";
import { Badge, buttonClass, Card, Empty, Money, Notice, PageHeader, SectionHeading, Stat, cx } from "@/components/ui";

type View = "today" | "yesterday" | "month" | "lastmonth" | "session" | "pick";

const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return addDays(mo === 12 ? `${y! + 1}-01-01` : `${y}-${String(mo! + 1).padStart(2, "0")}-01`, -1);
};
const prevMonth = (m: string) => periodOf(addDays(`${m}-01`, -1));
const clamp = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string; view?: string; m?: string }> }) {
  const user = await requireRole("dashboard");
  const sp = await searchParams;
  const { year, isCurrent } = await getWorkingYear();
  const now = today();
  const todayInYear = now >= year.startDate && now <= year.endDate;

  // Period inside the selected academic session.
  const picked = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : undefined;
  const view: View = picked ? "pick" : (["today", "yesterday", "month", "lastmonth", "session"].includes(sp.view ?? "") ? sp.view as View : todayInYear ? "today" : "session");
  const thisMonth = periodOf(todayInYear ? now : year.endDate);
  let from: string, to: string, label: string;
  switch (view) {
    case "today": from = to = now; label = `Today, ${formatDate(now)}`; break;
    case "yesterday": from = to = addDays(now, -1); label = `Yesterday, ${formatDate(from)}`; break;
    case "month": from = `${thisMonth}-01`; to = todayInYear ? now : monthEnd(thisMonth); label = periodLabel(thisMonth); break;
    case "lastmonth": { const m = prevMonth(thisMonth); from = `${m}-01`; to = monthEnd(m); label = periodLabel(m); break; }
    case "pick": from = `${picked}-01`; to = monthEnd(picked!); label = periodLabel(picked!); break;
    default: from = year.startDate; to = year.endDate; label = `Whole session ${year.name}`;
  }
  // A period entirely outside the session (e.g. a month picked from another year) shows nothing.
  const outside = to < year.startDate || from > year.endDate;
  from = clamp(from, year.startDate, year.endDate);
  to = clamp(to, year.startDate, year.endDate);
  if (outside) { from = year.endDate; to = year.startDate; } // empty range → all period figures are zero

  const [d, h] = await Promise.all([
    reports.dashboard({ yearId: year.id, yearStart: year.startDate, yearEnd: year.endDate, from, to }),
    ops.health(),
  ]);
  const pct = d.period.billed ? Math.round((d.period.collected / d.period.billed) * 100) : null;
  const sessionPct = d.session.billed ? Math.round((d.session.collected / d.session.billed) * 100) : 0;
  const maxMonth = Math.max(1, ...d.months.map((m) => Math.max(m.collected, m.billed)));
  // Every day of the period (empty days included) so the chart reads like a calendar.
  const days: { day: string; v: number }[] = [];
  if (!outside && from <= to && view !== "session") for (let x = from; x <= to; x = addDays(x, 1)) days.push({ day: x, v: d.period.daily.find((y) => y.day === x)?.v ?? 0 });
  const maxDay = Math.max(1, ...days.map((x) => x.v));
  const selMonth = view === "pick" ? picked : view === "month" ? thisMonth : view === "lastmonth" ? prevMonth(thisMonth) : undefined;

  const tabs: { key: View; label: string; href: string }[] = [
    ...(todayInYear ? [{ key: "today" as const, label: "Today", href: "/?view=today" }, { key: "yesterday" as const, label: "Yesterday", href: "/?view=yesterday" }] : []),
    { key: "month", label: todayInYear ? "This month" : `Last month of session`, href: "/?view=month" },
    { key: "lastmonth", label: "Previous month", href: "/?view=lastmonth" },
    { key: "session", label: "Whole session", href: "/?view=session" },
  ];

  return (
    <div className="page-stack">
      <PageHeader title={`Dashboard · ${year.name}`} subtitle={<>Welcome, {user.fullName}. Showing <b>{label}</b>{!isCurrent && " (not the current session)"}.</>} />
      {sp.denied && <Notice tone="warn">You don&apos;t have access to that page.</Notice>}
      {"issues" in h && h.issues && h.issues.length > 0 && user.role === "ADMIN" && (
        <Notice tone="error">Integrity check found {h.issues.length} problem(s). <Link className="underline" href="/settings/health">View</Link></Notice>
      )}
      {"usbBackupOverdue" in h && h.usbBackupOverdue && user.role === "ADMIN" && (
        <Notice tone="warn">Weekly USB backup is overdue{h.usbDays != null ? ` (last ${h.usbDays} days ago)` : ""}. <Link className="underline" href="/settings/health">Backups</Link></Notice>
      )}

      {/* Period picker */}
      <div className="no-print toolbar mb-6">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={buttonClass(view === t.key ? "primary" : "secondary")}>{t.label}</Link>
        ))}
        <form className="toolbar">
          <input type="month" name="m" defaultValue={selMonth ?? thisMonth} min={periodOf(year.startDate)} max={periodOf(year.endDate)}
            className={cx("w-40", view === "pick" && "border-accent ring-4 ring-accent/10")} aria-label="Pick a month" />
          <button className="filter-button">Show month</button>
        </form>
      </div>
      {outside && <Notice>That period is outside the {year.name} session, so there is nothing to show.</Notice>}

      {/* Period figures */}
      <div>
        <SectionHeading>{label}</SectionHeading>
        <div className="stat-grid">
          <Stat label="Collected" value={formatINR(d.period.collected)} sub={`${d.period.receipts} receipt${d.period.receipts === 1 ? "" : "s"}`} tone="green" />
          <Stat label="Billed" value={formatINR(d.period.billed)} sub={`${d.period.bills} bill${d.period.bills === 1 ? "" : "s"} issued`} />
          <Stat label="Collected vs billed" value={pct === null ? "—" : `${pct}%`} sub={pct === null ? "No bills issued in this period" : "of amount billed in this period"} />
          <Stat label="Average receipt" value={d.period.receipts ? formatINR(Math.round(d.period.collected / d.period.receipts)) : "—"} sub="per payment" />
        </div>
      </div>

      {/* Session figures */}
      <div>
        <SectionHeading>Session {year.name} so far</SectionHeading>
        <div className="stat-grid">
          <Stat label="Billed in session" value={formatINR(d.session.billed)} />
          <Stat label="Collected in session" value={formatINR(d.session.collected)} sub={`${sessionPct}% of billed`} tone="green" />
          <Stat label="Outstanding" value={formatINR(d.session.outstanding)} sub={<>Overdue {formatINR(d.session.overdue)}</>} tone={d.session.outstanding ? "red" : undefined} />
          <Stat label="Messages" value={d.queuedMessages} sub={<Link href="/notifications?status=failed" className={d.failedMessages ? "text-red-600 underline" : ""}>{d.failedMessages} failed · queued now</Link>} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Month by month · ${year.name}`} actions={<span className="flex items-center gap-3 text-xs text-gray-500"><span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />Collected</span><span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300" />Billed</span></span>}>
          <div className="flex h-48 items-end gap-1 sm:gap-2">
            {d.months.map((m) => (
              <Link key={m.month} href={`/?m=${m.month}`} title={`${periodLabel(m.month)}: collected ${formatINR(m.collected)}, billed ${formatINR(m.billed)}`}
                className={cx("group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded px-0.5", selMonth === m.month && "bg-tint/60")}>
                <div className="flex h-36 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-gray-300 group-hover:bg-gray-400" style={{ height: `${m.billed ? Math.max(3, (m.billed / maxMonth) * 100) : 0}%` }} />
                  <div className="w-1/2 rounded-t bg-accent group-hover:bg-accent-ink" style={{ height: `${m.collected ? Math.max(3, (m.collected / maxMonth) * 100) : 0}%` }} />
                </div>
                <div className={cx("truncate text-[10px] sm:text-xs", selMonth === m.month ? "font-semibold text-ink" : "text-gray-600")}>{periodLabel(m.month).split(" ")[0]}</div>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Click a month to see its figures.</p>
        </Card>

        <Card title={view === "today" || view === "yesterday" ? `Collected by mode · ${label}` : `Day by day · ${label}`}>
          {view === "today" || view === "yesterday" || d.period.daily.length === 0 || view === "session" ? (
            d.period.byMode.length === 0 ? <Empty>Nothing collected in this period.</Empty> : (
              <table className="data"><tbody>{d.period.byMode.map((m) => (
                <tr key={m.mode}><td className="capitalize">{m.mode.replace("_", " ")}</td><td className="num text-gray-500">{m.n}</td><td className="num"><Money p={m.v} /></td></tr>
              ))}</tbody></table>
            )
          ) : (
            <>
              <div className="flex h-40 items-end gap-0.5 border-b border-gray-200">
                {days.map((x) => (
                  <div key={x.day} title={`${formatDate(x.day)}: ${formatINR(x.v)}`} className="flex h-full min-w-0 flex-1 flex-col justify-end hover:bg-subtle">
                    {x.v > 0 && <div className="rounded-t bg-accent" style={{ height: `${Math.max(4, (x.v / maxDay) * 100)}%` }} />}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>{formatDate(days[0]?.day)}</span><span>{formatDate(days.at(-1)?.day)}</span></div>
              <table className="data mt-3"><tbody>{d.period.byMode.map((m) => (
                <tr key={m.mode}><td className="capitalize">{m.mode.replace("_", " ")}</td><td className="num text-gray-500">{m.n}</td><td className="num"><Money p={m.v} /></td></tr>
              ))}</tbody></table>
            </>
          )}
        </Card>

        <Card title={`Recent receipts · ${label}`} actions={<Link href={`/reports?from=${from}&to=${to}`} className="text-xs text-ink hover:underline">Full report →</Link>}>
          {d.period.recent.length === 0 ? <Empty>No receipts in this period.</Empty> : (
            <table className="data"><tbody>{d.period.recent.map((x) => (
              <tr key={x.id}>
                <td><Link className="text-ink hover:underline" href={`/receipts/${x.id}`}>{x.receiptNo}</Link><div className="text-xs text-gray-500">{formatDate(x.date)}</div></td>
                <td><Link className="hover:underline" href={`/students/${x.studentId}`}>{x.studentName}</Link></td>
                <td><Badge>{x.mode}</Badge></td>
                <td className="num"><Money p={x.amount} /></td>
              </tr>
            ))}</tbody></table>
          )}
        </Card>

        <Card title={`Top overdue classes · ${year.name}`} actions={<Link href="/reports/defaulters" className="text-xs text-ink hover:underline">Defaulters →</Link>}>
          {d.topClasses.length === 0 ? <Empty>No overdue dues in this session.</Empty> : (
            <table className="data"><thead><tr><th>Class</th><th className="num">Students</th><th className="num">Overdue</th></tr></thead>
              <tbody>{d.topClasses.map((c) => <tr key={c.className}><td>{c.className}</td><td className="num">{c.students}</td><td className="num"><Money p={c.v} /></td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
