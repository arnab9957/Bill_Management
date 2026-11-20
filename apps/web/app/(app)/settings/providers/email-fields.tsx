"use client";
import { useEffect, useState } from "react";
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState(config.hasBrevoApiKey ? MASK : "");
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const [formValues, setFormValues] = useState({
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPass: config.hasSmtpPass ? MASK : "",
    smtpFrom: config.smtpFrom,
    smtpSecure: config.smtpSecure,
    brevoSenderEmail: config.brevoSenderEmail,
    brevoSenderName: config.brevoSenderName,
  });

  useEffect(() => {
    setMode(config.emailMode);
    setApiKey(config.hasBrevoApiKey ? MASK : "");
    setApiKeyEdited(false);
    setShowApiKey(false);
    setFormValues({
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPass: config.hasSmtpPass ? MASK : "",
      smtpFrom: config.smtpFrom,
      smtpSecure: config.smtpSecure,
      brevoSenderEmail: config.brevoSenderEmail,
      brevoSenderName: config.brevoSenderName,
    });
  }, [config]);

  const toggleApiKey = async () => {
    if (showApiKey) {
      setShowApiKey(false);
      if (!apiKeyEdited) setApiKey(config.hasBrevoApiKey ? MASK : "");
      return;
    }
    if (!apiKeyEdited && config.hasBrevoApiKey) {
      setRevealing(true);
      try { setApiKey(await revealApiKey()); } finally { setRevealing(false); }
    }
    setShowApiKey(true);
  };

  const cancel = () => {
    setMode(config.emailMode);
    setDirty(false);
    setEditing(false);
    setApiKey(config.hasBrevoApiKey ? MASK : "");
    setApiKeyEdited(false);
    setShowApiKey(false);
    setFormValues({
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPass: config.hasSmtpPass ? MASK : "",
      smtpFrom: config.smtpFrom,
      smtpSecure: config.smtpSecure,
      brevoSenderEmail: config.brevoSenderEmail,
      brevoSenderName: config.brevoSenderName,
    });
  };

  return (
    <Card
      title="Email (Brevo or SMTP)"
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm
        action={action}
        className="space-y-5"
        onSuccess={() => {
          setDirty(false);
          setEditing(false);
          setApiKeyEdited(false);
          setShowApiKey(false);
        }}
      >
        <fieldset disabled={!editing} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">Mode
              <select
                name="emailMode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as ProviderConfig["emailMode"]);
                  setDirty(true);
                  if (e.target.value !== "brevo") {
                    setApiKey(config.hasBrevoApiKey ? MASK : "");
                    setApiKeyEdited(false);
                    setShowApiKey(false);
                  }
                }}
              >
                <option value="brevo">Brevo API</option>
                <option value="smtp">SMTP</option>
                <option value="off">Off</option>
              </select>
            </label>
            {mode === "smtp" && <>
              <label className="flex flex-col gap-2">Host
                <input
                  name="smtpHost"
                  value={formValues.smtpHost}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpHost: e.target.value })); setDirty(true); }}
                  placeholder="smtp.gmail.com"
                />
              </label>
              <label className="flex flex-col gap-2">Port
                <input
                  name="smtpPort"
                  type="number"
                  value={formValues.smtpPort}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpPort: Number(e.target.value) || 0 })); setDirty(true); }}
                />
              </label>
              <label className="flex flex-col gap-2">User
                <input
                  name="smtpUser"
                  value={formValues.smtpUser}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpUser: e.target.value })); setDirty(true); }}
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-2">Password / app password
                <input
                  name="smtpPass"
                  type="password"
                  value={formValues.smtpPass}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpPass: e.target.value })); setDirty(true); }}
                  autoComplete="new-password"
                />
              </label>
              <label className="flex flex-col gap-2">From
                <input
                  name="smtpFrom"
                  value={formValues.smtpFrom}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpFrom: e.target.value })); setDirty(true); }}
                  placeholder="School <fees@school.in>"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="smtpSecure"
                  checked={formValues.smtpSecure}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smtpSecure: e.target.checked })); setDirty(true); }}
                />
                TLS on connect (port 465)
              </label>
            </>}
            {mode === "brevo" && <>
              <label className="flex flex-col gap-2">Brevo API key
                <span className="flex items-center gap-2">
                  <input
                    name="brevoApiKey"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setApiKeyEdited(true); setDirty(true); }}
                    autoComplete="new-password"
                    className="min-w-0 flex-1"
                  />
                  <button type="button" onClick={toggleApiKey} disabled={revealing} className={buttonClass("secondary", "sm")}>
                    {revealing ? "Loading…" : showApiKey ? "Hide" : "Show"}
                  </button>
                </span>
                <FieldError name="brevoApiKey" />
              </label>
              <label className="flex flex-col gap-2">Brevo sender email
                <input
                  name="brevoSenderEmail"
                  type="email"
                  value={formValues.brevoSenderEmail}
                  onChange={(e) => { setFormValues((v) => ({ ...v, brevoSenderEmail: e.target.value })); setDirty(true); }}
                  placeholder="fees@school.in"
                />
                <FieldError name="brevoSenderEmail" />
              </label>
              <label className="flex flex-col gap-2">Brevo sender name
                <input
                  name="brevoSenderName"
                  value={formValues.brevoSenderName}
                  onChange={(e) => { setFormValues((v) => ({ ...v, brevoSenderName: e.target.value })); setDirty(true); }}
                  placeholder="School Fees"
                />
              </label>
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
