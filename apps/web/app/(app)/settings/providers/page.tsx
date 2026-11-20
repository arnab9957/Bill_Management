import { getProviderConfig, saveProviderConfig } from "@sb/core";
import { getDb } from "@sb/db";
import { providerConfigSchema } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { LinkButton, PageHeader } from "@/components/ui";
import { EmailProviderForm } from "./email-fields";
import { WhatsAppProviderForm } from "./whatsapp-fields";
import { SmsProviderForm } from "./sms-fields";

const MASK = "••••••••";

async function saveConfigSection(fd: FormData) {
  const current = await getProviderConfig();
  const raw = formObject(fd);
  for (const k of ["smtpPass", "brevoApiKey", "waAccessToken", "smsGatewayToken"] as const) if (raw[k] === MASK) raw[k] = current[k];
  if (raw.whatsappMode === "device") raw.waAccessToken = current.waAccessToken;
  if (raw.emailMode === "smtp" && raw.smtpSecure == null) raw.smtpSecure = false;
  return providerConfigSchema.parse({ ...current, ...raw });
}

async function saveEmail(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  return run(async () => saveProviderConfig(getDb(), u, await saveConfigSection(fd)), "Email settings saved (secrets stay encrypted)");
}

async function saveWhatsapp(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  return run(async () => saveProviderConfig(getDb(), u, await saveConfigSection(fd)), "WhatsApp settings saved");
}

async function saveSms(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  return run(async () => saveProviderConfig(getDb(), u, await saveConfigSection(fd)), "SMS settings saved (secrets stay encrypted)");
}

export default async function Providers() {
  await requireRole("settings");
  const c = await getProviderConfig();
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Message providers" subtitle="Choose how fee reminders and receipts reach parents. Each section saves on its own; credentials stay encrypted." actions={<LinkButton href="/settings">Back</LinkButton>} />
      <EmailProviderForm action={saveEmail} config={{
        emailMode: c.emailMode,
        smtpHost: c.smtpHost,
        smtpPort: c.smtpPort,
        smtpUser: c.smtpUser,
        hasSmtpPass: !!c.smtpPass,
        smtpFrom: c.smtpFrom,
        smtpSecure: c.smtpSecure,
        hasBrevoApiKey: !!c.brevoApiKey,
        brevoSenderEmail: c.brevoSenderEmail,
        brevoSenderName: c.brevoSenderName,
      }} />
      <WhatsAppProviderForm action={saveWhatsapp} config={{
        whatsappMode: c.whatsappMode,
        waPhoneNumberId: c.waPhoneNumberId,
        waApiVersion: c.waApiVersion,
        hasWaAccessToken: !!c.waAccessToken,
      }} />
      <SmsProviderForm action={saveSms} config={{
        smsMode: c.smsMode,
        smsMethod: c.smsMethod,
        smsSenderId: c.smsSenderId,
        smsUrl: c.smsUrl,
        smsGatewayUrl: c.smsGatewayUrl,
        hasSmsGatewayToken: !!c.smsGatewayToken,
      }} />
    </div>
  );
}
