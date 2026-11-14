import { getProviderConfig, saveProviderConfig } from "@sb/core";
import { getDb } from "@sb/db";
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
    </div>
  );
}
