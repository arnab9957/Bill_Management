"use client";
import { useState } from "react";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { buttonClass, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import type { ProviderConfig } from "@sb/validation";

const MASK = "••••••••";

type EmailFields = {
  emailMode: ProviderConfig["emailMode"];
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPass: boolean;
  smtpFrom: string;
  smtpSecure: boolean;
  hasBrevoApiKey: boolean;
  brevoSenderEmail: string;
  brevoSenderName: string;
};

export function EmailProviderForm({ action, config, revealApiKey }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; config: EmailFields; revealApiKey: () => Promise<string> }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<ProviderConfig["emailMode"]>(config.emailMode);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState(config.hasBrevoApiKey ? MASK : "");
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const masked = (has: boolean) => (has ? MASK : "");
  const resetApiKey = () => { setApiKey(masked(config.hasBrevoApiKey)); setApiKeyEdited(false); setShowApiKey(false); };
  const toggleApiKey = async () => {
    if (showApiKey) {
      setShowApiKey(false);
      if (!apiKeyEdited) setApiKey(masked(config.hasBrevoApiKey));
      return;
    }
    if (!apiKeyEdited && config.hasBrevoApiKey) {
      setRevealing(true);
      try { setApiKey(await revealApiKey()); } finally { setRevealing(false); }
    }
    setShowApiKey(true);
  };
  const cancel = () => { setMode(config.emailMode); setDirty(false); setEditing(false); resetApiKey(); setVersion((v) => v + 1); };
  return (
    <Card
      title="Email (Brevo or SMTP)"
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm key={version} action={action} className="space-y-5" onSuccess={() => { setDirty(false); setEditing(false); resetApiKey(); }}>
        <fieldset disabled={!editing} className="space-y-5" onChange={() => setDirty(true)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">Mode
              <select name="emailMode" value={mode} onChange={(e) => { setMode(e.target.value as ProviderConfig["emailMode"]); if (e.target.value !== "brevo") resetApiKey(); }}>
                <option value="brevo">Brevo API</option>
                <option value="smtp">SMTP</option>
                <option value="off">Off</option>
              </select>
            </label>
            {mode === "smtp" && <>
              <label className="flex flex-col gap-2">Host<input name="smtpHost" defaultValue={config.smtpHost} placeholder="smtp.gmail.com" /></label>
              <label className="flex flex-col gap-2">Port<input name="smtpPort" defaultValue={config.smtpPort} /></label>
              <label className="flex flex-col gap-2">User<input name="smtpUser" defaultValue={config.smtpUser} autoComplete="off" /></label>
              <label className="flex flex-col gap-2">Password / app password<input name="smtpPass" type="password" defaultValue={masked(config.hasSmtpPass)} autoComplete="new-password" /></label>
              <label className="flex flex-col gap-2">From<input name="smtpFrom" defaultValue={config.smtpFrom} placeholder="School <fees@school.in>" /></label>
              <label className="flex items-center gap-2"><input type="checkbox" name="smtpSecure" defaultChecked={config.smtpSecure} />TLS on connect (port 465)</label>
            </>}
            {mode === "brevo" && <>
              <label className="flex flex-col gap-2">Brevo API key
                <span className="flex items-center gap-2">
                  <input name="brevoApiKey" type={showApiKey ? "text" : "password"} value={apiKey} onChange={(e) => { setApiKey(e.target.value); setApiKeyEdited(true); }} autoComplete="new-password" className="min-w-0 flex-1" />
                  <button type="button" onClick={toggleApiKey} disabled={revealing} className={buttonClass("secondary", "sm")}>{revealing ? "Loading…" : showApiKey ? "Hide" : "Show"}</button>
                </span>
                <FieldError name="brevoApiKey" />
              </label>
              <label className="flex flex-col gap-2">Brevo sender email<input name="brevoSenderEmail" type="email" defaultValue={config.brevoSenderEmail} placeholder="fees@school.in" /><FieldError name="brevoSenderEmail" /></label>
              <label className="flex flex-col gap-2">Brevo sender name<input name="brevoSenderName" defaultValue={config.brevoSenderName} placeholder="School Fees" /></label>
            </>}
          </div>
          {mode === "brevo" && <p className="mt-1 text-xs leading-relaxed text-gray-500">Verify the sender email under Brevo → Senders &amp; Domains, then save an API key with email send access.</p>}
        </fieldset>
        {editing && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Submit disabled={!dirty}>Save email settings</Submit>
            <button type="button" onClick={cancel} className={buttonClass("secondary")}>Cancel</button>
          </div>
        )}
      </ActionForm>
    </Card>
  );
}
