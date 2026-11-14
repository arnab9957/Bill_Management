import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notifications } from "@sb/core";
import type { Channel, OutboxRow } from "@sb/db";
import { requireRole } from "@/lib/auth";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

async function retry(id: number) {
  "use server";
  const u = await requireRole("notifications");
  await notifications.retryMessage(u, id);
  revalidatePath("/notifications");
}
async function cancel(id: number) {
  "use server";
  const u = await requireRole("notifications");
  await notifications.cancelMessage(u, id);
  revalidatePath("/notifications");
}

export default async function Messages({ searchParams }: { searchParams: Promise<{ status?: OutboxRow["status"]; channel?: Channel }> }) {
  await requireRole("notifications");
  const sp = await searchParams;
  const [rows, stats] = await Promise.all([notifications.listOutbox(sp), notifications.outboxStats()]);
  const link = (k: string, v?: string) => `?${new URLSearchParams({ ...sp, [k]: v ?? "" } as Record<string, string>)}`;
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" subtitle="Every SMS, WhatsApp and email goes through this queue and is sent when the internet is available (09:00–20:00 by default)."
        actions={<LinkButton href="/notifications/templates">Templates</LinkButton>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {(["queued", "sending", "sent", "failed", "cancelled"] as const).map((s) => (
          <Link key={s} href={link("status", s)}><Stat label={s} value={stats[s] ?? 0} tone={s === "failed" && stats.failed ? "red" : undefined} /></Link>
        ))}
      </div>
      <Card>
        <div className="mb-3 flex gap-2 text-sm">
          <Link className="text-brand-700 hover:underline" href="?">All</Link>
          {(["whatsapp", "sms", "email"] as const).map((c) => <Link key={c} className="capitalize text-brand-700 hover:underline" href={link("channel", c)}>{c}</Link>)}
        </div>
        {rows.length === 0 ? <Empty>No messages.</Empty> : (
          <table className="data">
            <thead><tr><th>Created</th><th>Event</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs">{m.createdAt.toLocaleString("en-IN")}</td>
                <td className="text-xs">{m.event.replace(/_/g, " ").toLowerCase()}</td>
                <td className="capitalize">{m.channel}</td>
                <td className="text-xs">{m.recipient}</td>
                <td className="wrap max-w-md text-xs"><div className="line-clamp-2 whitespace-pre-line" title={m.body}>{m.body}</div></td>
                <td className="wrap"><Badge>{m.status}</Badge>
                  <div className="text-xs text-gray-500">{m.attempts ? `${m.attempts} attempt(s)` : ""}{m.lastError ? ` · ${m.lastError}` : ""}</div>
                  {m.sentAt && <div className="text-xs text-gray-500">sent {m.sentAt.toLocaleString("en-IN")}</div>}</td>
                <td className="whitespace-nowrap">
                  {(m.status === "failed" || m.status === "cancelled") && <form action={retry.bind(null, m.id)}><button className="text-xs text-brand-700 hover:underline">Retry</button></form>}
                  {m.status === "queued" && <form action={cancel.bind(null, m.id)}><button className="text-xs text-red-600 hover:underline">Cancel</button></form>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
