"use client";
import { useState, useTransition } from "react";
import type { Channel } from "@sb/db";
import type { ChannelAvailability } from "@sb/core";
import { sendReminderAction } from "@/app/(app)/reminder-actions";
import { buttonClass, cx } from "./ui";

export function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.39 9.39 0 0 1-1.44-5.01c0-5.19 4.23-9.42 9.43-9.42 2.52 0 4.88.98 6.66 2.76a9.36 9.36 0 0 1 2.76 6.67c0 5.2-4.23 9.42-9.43 9.42m8.02-17.44A11.27 11.27 0 0 0 12.05.75C5.8.75.7 5.84.7 12.1c0 2 .52 3.95 1.52 5.67L.6 23.25l5.6-1.47a11.3 11.3 0 0 0 5.84 1.49h.01c6.25 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02" />
    </svg>
  );
}
export function MailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="m3 6 9 7 9-7" />
    </svg>
  );
}
export function SmsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.15L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.6" />
    </svg>
  );
}

const STYLE: Record<Channel, { label: string; cls: string; Icon: (p: { className?: string }) => React.ReactElement }> = {
  whatsapp: { label: "WhatsApp", cls: "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100", Icon: WhatsAppIcon },
  email: { label: "Email", cls: "border-gray-300 bg-surface text-gray-700 hover:border-ink hover:text-ink", Icon: MailIcon },
  sms: { label: "SMS", cls: "border-gray-300 bg-surface text-gray-700 hover:border-ink hover:text-ink", Icon: SmsIcon },
};

/**
 * Manual reminder buttons. `compact` = icon-only (for table rows); otherwise icon + label.
 * Buttons are disabled with a tooltip when the parent can't be reached on that channel.
 */
export function ReminderButtons({ studentIds, availability, compact }: { studentIds: number[]; availability?: ChannelAvailability; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Channel | "all" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [links, setLinks] = useState<string[]>([]);

  const send = (channels: Channel[], key: Channel | "all") => {
    setBusy(key);
    setMsg(null);
    setLinks([]);
    start(async () => {
      const r = await sendReminderAction(studentIds, channels);
      if (r.whatsappLinks?.length) {
        setLinks(r.whatsappLinks);
        if (r.whatsappLinks.length === 1) window.open(r.whatsappLinks[0], "_blank", "noopener,noreferrer");
      }
      setMsg({ ok: r.ok, text: r.message });
      setBusy(null);
    });
  };

  return (
    <div className={compact ? "inline-flex flex-col gap-1" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["whatsapp", "email", "sms"] as const).map((c) => {
          const a = availability?.[c] ?? { ok: true };
          const { label, cls, Icon } = STYLE[c];
          const title = a.ok ? `Send ${label} reminder${a.to ? ` to ${a.to}` : ""}` : `${label}: ${a.reason}`;
          return (
            <button key={c} type="button" disabled={!a.ok || pending} title={title} aria-label={title} onClick={() => send([c], c)}
              className={cx(buttonClass("secondary", "sm"), cls, compact && "px-2 py-1.5")}>
              {busy === c ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" /> : <Icon />}
              {!compact && label}
            </button>
          );
        })}
        {!compact && (
          <button type="button" disabled={pending || !availability || !Object.values(availability).some((x) => x.ok)}
            onClick={() => send((["whatsapp", "email", "sms"] as const).filter((c) => availability?.[c]?.ok), "all")}
            className={buttonClass("secondary", "sm")}>
            {busy === "all" ? "Sending…" : "All channels"}
          </button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-brand-700" : "text-red-700"}`}>{msg.text}</p>}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={cx(buttonClass("secondary", "sm"), "border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100")}>
              <WhatsAppIcon className="h-3.5 w-3.5" />Open chat {links.length > 1 ? i + 1 : ""}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
