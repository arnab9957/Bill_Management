/**
 * Channel adapters. Only the worker's dispatcher calls these — the rest of the
 * system just writes to the outbox and never touches the internet.
 */
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { lookup } from "node:dns/promises";
import { createConnection } from "node:net";
import nodemailer from "nodemailer";
import type { NotificationAdapter, OutboundMessage, SendResult } from "@sb/core";
import type { ProviderConfig } from "@sb/validation";
import type { Channel } from "@sb/db";

const fail = (error: string, permanent = false): SendResult => ({ ok: false, error, permanent });
const toE164 = (mobile: string) => (mobile.length === 10 ? `91${mobile}` : mobile.replace(/^\+/, ""));

// ---------------------------------------------------------------- email
export function emailAdapter(cfg: ProviderConfig): NotificationAdapter {
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
  return {
    async send(m) {
      try {
        const info = await transport.sendMail({
          from: cfg.smtpFrom || cfg.smtpUser, to: m.recipient, subject: m.subject ?? "School fee update", text: m.body,
          attachments: m.attachmentPath ? [{ filename: basename(m.attachmentPath), path: m.attachmentPath }] : undefined,
        });
        return { ok: true, providerMsgId: info.messageId };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(msg, /Invalid (mail|recipient)|5\.1\.1/.test(msg));
      }
    },
  };
}

export function brevoAdapter(cfg: ProviderConfig): NotificationAdapter {
  return {
    async send(m) {
      try {
        const payload: Record<string, unknown> = {
          sender: { email: cfg.brevoSenderEmail.trim(), name: cfg.brevoSenderName.trim() || "School fee updates" },
          to: [{ email: m.recipient }],
          subject: m.subject ?? "School fee update",
          textContent: m.body,
        };
        if (m.attachmentPath) {
          payload.attachment = [{ name: basename(m.attachmentPath), content: (await readFile(m.attachmentPath)).toString("base64") }];
        }
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": cfg.brevoApiKey.trim(), "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        });
        const j = await r.json().catch(() => ({})) as { messageId?: string; code?: string | number; message?: string };
        if (!r.ok) {
          const error = [j.code, j.message].filter(Boolean).join(": ") || `Brevo HTTP ${r.status}`;
          return fail(error, [400, 401, 403, 404, 422].includes(r.status));
        }
        return { ok: true, providerMsgId: j.messageId };
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

// ---------------------------------------------------------------- WhatsApp (Meta Cloud API)
/**
 * Business-initiated messages must use an approved template. When the
 * template row has a provider template ID, the params are sent in the order
 * the placeholders appear in the stored body; otherwise a plain text message
 * is sent (only valid inside a 24h customer-service window).
 */
export function whatsappAdapter(cfg: ProviderConfig, templateBody?: (m: OutboundMessage) => string[]): NotificationAdapter {
  const base = `https://graph.facebook.com/${cfg.waApiVersion}/${cfg.waPhoneNumberId}`;
  const headers = { Authorization: `Bearer ${cfg.waAccessToken}`, "Content-Type": "application/json" };

  async function uploadMedia(path: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([await readFile(path)], { type: "application/pdf" }), basename(path));
    const r = await fetch(`${base}/media`, { method: "POST", headers: { Authorization: headers.Authorization }, body: form });
    const j = (await r.json()) as { id?: string; error?: { message: string } };
    if (!r.ok || !j.id) throw new Error(j.error?.message ?? `Media upload failed (${r.status})`);
    return j.id;
  }

  return {
    async send(m) {
      try {
        const to = toE164(m.recipient);
        let payload: Record<string, unknown>;
        if (m.providerTemplateId) {
          const params = templateBody ? templateBody(m) : [];
          const components: Record<string, unknown>[] = [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }];
          if (m.attachmentPath) {
            const id = await uploadMedia(m.attachmentPath);
            components.unshift({ type: "header", parameters: [{ type: "document", document: { id, filename: basename(m.attachmentPath) } }] });
          }
          payload = { messaging_product: "whatsapp", to, type: "template", template: { name: m.providerTemplateId, language: { code: "en" }, components } };
        } else {
          payload = { messaging_product: "whatsapp", to, type: "text", text: { body: m.body } };
        }
        const r = await fetch(`${base}/messages`, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) });
        const j = (await r.json()) as { messages?: { id: string }[]; error?: { message: string; code?: number } };
        if (!r.ok) return fail(j.error?.message ?? `HTTP ${r.status}`, r.status === 400);
        return { ok: true, providerMsgId: j.messages?.[0]?.id };
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

/** Positional template values stored by the outbox as {"1": …, "2": …}. */
export function orderedParams(params: Record<string, string> | null): string[] {
  return Object.entries(params ?? {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => v);
}

// ---------------------------------------------------------------- SMS
/** DLT-registered provider over HTTP. URL placeholders: {to} {message} {template_id} {sender} */
export function smsHttpAdapter(cfg: ProviderConfig): NotificationAdapter {
  return {
    async send(m) {
      try {
        const fill = (s: string) => s
          .replaceAll("{to}", encodeURIComponent(toE164(m.recipient)))
          .replaceAll("{message}", encodeURIComponent(m.body))
          .replaceAll("{template_id}", encodeURIComponent(m.providerTemplateId ?? ""))
          .replaceAll("{sender}", encodeURIComponent(cfg.smsSenderId));
        const r = await fetch(fill(cfg.smsUrl), { method: cfg.smsMethod, signal: AbortSignal.timeout(20_000) });
        const text = await r.text();
        if (!r.ok) return fail(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        return { ok: true, providerMsgId: text.slice(0, 100) };
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

/**
 * Offline SMS through an Android SMS-gateway app on the school LAN
 * (e.g. apps exposing POST /message {phoneNumbers, message}). Needs no internet.
 */
export function smsGatewayAdapter(cfg: ProviderConfig): NotificationAdapter {
  return {
    async send(m) {
      try {
        const r = await fetch(cfg.smsGatewayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cfg.smsGatewayToken ? { Authorization: cfg.smsGatewayToken } : {}) },
          body: JSON.stringify({ phoneNumbers: [`+${toE164(m.recipient)}`], message: m.body }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) return fail(`Gateway HTTP ${r.status}`);
        const j = (await r.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerMsgId: j.id };
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  };
}

/** Development / training: writes messages to storage/outbox-console.log instead of sending. */
export function consoleAdapter(channel: Channel, storageDir: string): NotificationAdapter {
  return {
    async send(m) {
      await mkdir(storageDir, { recursive: true });
      await appendFile(join(storageDir, "outbox-console.log"),
        `[${new Date().toISOString()}] ${channel.toUpperCase()} → ${m.recipient}${m.subject ? ` | ${m.subject}` : ""}\n${m.body}\n${m.attachmentPath ? `(attachment ${m.attachmentPath})\n` : ""}\n`);
      return { ok: true, providerMsgId: `console-${m.id}` };
    },
  };
}

export function buildAdapters(cfg: ProviderConfig, storageDir: string): { adapters: Partial<Record<Channel, NotificationAdapter>>; needsInternet: boolean } {
  const adapters: Partial<Record<Channel, NotificationAdapter>> = {};
  let needsInternet = false;
  if (cfg.emailMode === "brevo" && cfg.brevoApiKey && cfg.brevoSenderEmail) { adapters.email = brevoAdapter(cfg); needsInternet = true; }
  else if (cfg.emailMode === "smtp" && cfg.smtpHost) { adapters.email = emailAdapter(cfg); needsInternet = true; }
  if (cfg.whatsappMode === "cloud" && cfg.waAccessToken) { adapters.whatsapp = whatsappAdapter(cfg, (m) => orderedParams(m.templateParams)); needsInternet = true; }
  // "device" mode opens WhatsApp on this device via wa.me links; nothing is auto-sent by the worker.
  if (cfg.smsMode === "http" && cfg.smsUrl) { adapters.sms = smsHttpAdapter(cfg); needsInternet = true; }
  else if (cfg.smsMode === "gateway" && cfg.smsGatewayUrl) adapters.sms = smsGatewayAdapter(cfg);
  else if (cfg.smsMode === "console") adapters.sms = consoleAdapter("sms", storageDir);
  return { adapters, needsInternet };
}

/** Cheap connectivity probe: DNS + TCP to a public resolver. */
export async function isOnline(timeoutMs = 4000): Promise<boolean> {
  try {
    await Promise.race([lookup("graph.facebook.com"), new Promise((_, r) => setTimeout(() => r(new Error("dns timeout")), timeoutMs))]);
    return await new Promise<boolean>((ok) => {
      const s = createConnection({ host: "1.1.1.1", port: 443, timeout: timeoutMs });
      s.on("connect", () => { s.destroy(); ok(true); });
      s.on("error", () => ok(false));
      s.on("timeout", () => { s.destroy(); ok(false); });
    });
  } catch {
    return false;
  }
}
