"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { buttonClass, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import type { ProviderConfig } from "@sb/validation";

const MASK = "••••••••";

type WhatsAppFields = {
  whatsappMode: ProviderConfig["whatsappMode"];
  waPhoneNumberId: string;
  waApiVersion: string;
  hasWaAccessToken: boolean;
};

export function WhatsAppProviderForm({ action, config }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; config: WhatsAppFields }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<ProviderConfig["whatsappMode"]>(config.whatsappMode);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const cancel = () => { setMode(config.whatsappMode); setDirty(false); setEditing(false); setVersion((v) => v + 1); };
  return (
    <Card
      title="WhatsApp (device or Meta Cloud API)"
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm key={version} action={action} className="space-y-5" onSuccess={() => { setDirty(false); setEditing(false); }}>
        <fieldset disabled={!editing} className="space-y-5" onChange={() => setDirty(true)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">Mode
              <select name="whatsappMode" value={mode} onChange={(e) => setMode(e.target.value as ProviderConfig["whatsappMode"])}>
                <option value="device">Device WhatsApp (wa.me)</option>
                <option value="cloud">Meta Cloud API</option>
                <option value="off">Off</option>
              </select>
            </label>
            {mode === "cloud" && <>
              <label className="flex flex-col gap-2">Phone number ID<input name="waPhoneNumberId" defaultValue={config.waPhoneNumberId} /></label>
              <label className="flex flex-col gap-2">API version<input name="waApiVersion" defaultValue={config.waApiVersion} /></label>
              <label className="flex flex-col gap-2 sm:col-span-3">Access token<input name="waAccessToken" type="password" defaultValue={config.hasWaAccessToken ? MASK : ""} autoComplete="new-password" /></label>
            </>}
          </div>
          {mode === "device" && <p className="text-xs leading-relaxed text-gray-500">Reminders open a chat in the WhatsApp app or WhatsApp Web logged in on this device. The message is ready to review and send; nothing is sent automatically in the background.</p>}
        </fieldset>
        {editing && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Submit disabled={!dirty}>Save WhatsApp settings</Submit>
            <button type="button" onClick={cancel} className={buttonClass("secondary")}>Cancel</button>
          </div>
        )}
      </ActionForm>
    </Card>
  );
}
