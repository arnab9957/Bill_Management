import { getProviderConfig, saveProviderConfig } from "@sb/core";
import { getDb } from "@sb/db";
import { getSettings } from "@sb/core";
import { emailAdapter } from "@sb/notifications";
import { FieldError } from "@/components/action-form";
import { providerConfigSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";

const MASK = "••••••••";

async function save(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const current = await getProviderConfig();
  const raw = formObject(fd);
  // Keep stored secrets when the masked placeholder is submitted unchanged.
  for (const k of ["smtpPass", "waAccessToken", "smsGatewayToken"] as const) if (raw[k] === MASK) raw[k] = current[k];
  return run(() => saveProviderConfig(getDb(), u, providerConfigSchema.parse(raw)), "Saved (secrets are stored encrypted)");
}

async function testEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  await requireRole("settings");
  const to = String(fd.get("to") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: "Enter a valid email address", errors: { to: "Invalid email" } };
  const cfg = await getProviderConfig();
  if (cfg.emailMode !== "smtp") return { ok: false, message: "Email mode is not SMTP. Choose SMTP above, enter the app password and save first." };
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPass) return { ok: false, message: "SMTP host, user and password are required. Save them above first." };
  const s = await getSettings();
  // Admin-only connection test: the one place the web app talks to a provider directly.
  const r = await emailAdapter(cfg).send({
    id: 0, channel: "email", recipient: to, subject: `Test email from ${s.name}`,
    body: `This is a test from the ${s.name} fee billing system.

If you can read this, fee reminders and receipts by email are working.

Sent ${new Date().toLocaleString("en-IN")}.`,
    providerTemplateId: null, templateParams: null, attachmentPath: null,
  });
  return r.ok ? { ok: true, message: `Sent to ${to}. Check the inbox (and the Spam folder).` } : { ok: false, message: `Gmail/SMTP refused: ${r.error}` };
}

export default async function Providers() {
  await requireRole("settings");
  const c = await getProviderConfig();
  const secret = (v: string) => (v ? MASK : "");
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Message providers" actions={<LinkButton href="/settings">Back</LinkButton>} />
      <Notice>“Console” mode writes messages to <code>storage/outbox-console.log</code> instead of sending — use it for training. Start WhatsApp Business verification and SMS DLT registration early; approvals take days to weeks.</Notice>
      <ActionForm action={save} className="space-y-4">
        <Card title="Email (SMTP)">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">Mode<select name="emailMode" defaultValue={c.emailMode}><option value="console">Console (test)</option><option value="smtp">SMTP</option><option value="off">Off</option></select></label>
            <label className="flex flex-col gap-1">Host<input name="smtpHost" defaultValue={c.smtpHost} placeholder="smtp.gmail.com" /></label>
            <label className="flex flex-col gap-1">Port<input name="smtpPort" defaultValue={c.smtpPort} /></label>
            <label className="flex flex-col gap-1">User<input name="smtpUser" defaultValue={c.smtpUser} autoComplete="off" /></label>
            <label className="flex flex-col gap-1">Password / app password<input name="smtpPass" type="password" defaultValue={secret(c.smtpPass)} autoComplete="new-password" /></label>
            <label className="flex flex-col gap-1">From<input name="smtpFrom" defaultValue={c.smtpFrom} placeholder="School <fees@school.in>" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" name="smtpSecure" defaultChecked={c.smtpSecure} />TLS on connect (port 465)</label>
          </div>
        </Card>
        <Card title="WhatsApp (Meta Cloud API)">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">Mode<select name="whatsappMode" defaultValue={c.whatsappMode}><option value="console">Console (test)</option><option value="cloud">Cloud API</option><option value="off">Off</option></select></label>
            <label className="flex flex-col gap-1">Phone number ID<input name="waPhoneNumberId" defaultValue={c.waPhoneNumberId} /></label>
            <label className="flex flex-col gap-1">API version<input name="waApiVersion" defaultValue={c.waApiVersion} /></label>
            <label className="flex flex-col gap-1 sm:col-span-3">Access token<input name="waAccessToken" type="password" defaultValue={secret(c.waAccessToken)} autoComplete="new-password" /></label>
          </div>
        </Card>
        <Card title="SMS">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">Mode<select name="smsMode" defaultValue={c.smsMode}><option value="console">Console (test)</option><option value="http">DLT provider (internet)</option><option value="gateway">Android gateway on LAN (offline)</option><option value="off">Off</option></select></label>
            <label className="flex flex-col gap-1">Method<select name="smsMethod" defaultValue={c.smsMethod}><option>GET</option><option>POST</option></select></label>
            <label className="flex flex-col gap-1">Sender ID<input name="smsSenderId" defaultValue={c.smsSenderId} /></label>
            <label className="flex flex-col gap-1 sm:col-span-3">Provider URL<input name="smsUrl" defaultValue={c.smsUrl} placeholder="https://provider/api?to={to}&msg={message}&tid={template_id}&sender={sender}&key=..." /></label>
            <label className="flex flex-col gap-1 sm:col-span-2">Gateway URL<input name="smsGatewayUrl" defaultValue={c.smsGatewayUrl} placeholder="http://192.168.1.50:8080/message" /></label>
            <label className="flex flex-col gap-1">Gateway auth header<input name="smsGatewayToken" type="password" defaultValue={secret(c.smsGatewayToken)} /></label>
          </div>
        </Card>
        <Submit>Save providers</Submit>
      </ActionForm>
      <Card title="Send a test email">
        <p className="mb-3 text-sm text-gray-600">Checks the saved SMTP settings by sending one email right now. For Gmail use host <b>smtp.gmail.com</b>, port <b>587</b>, your Gmail address as user, and a 16-character <b>App password</b> (Google Account → Security → 2-Step Verification → App passwords), not your normal password.</p>
        <ActionForm action={testEmail} className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1"><input name="to" type="email" placeholder="someone@example.com" className="w-72" required /><FieldError name="to" /></div>
          <Submit>Send test email</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
