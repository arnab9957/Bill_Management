"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { buttonClass, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import type { ProviderConfig } from "@sb/validation";

const MASK = "••••••••";

type SmsFields = {
  smsMode: ProviderConfig["smsMode"];
  smsMethod: ProviderConfig["smsMethod"];
  smsSenderId: string;
  smsUrl: string;
  smsGatewayUrl: string;
  hasSmsGatewayToken: boolean;
};

export function SmsProviderForm({ action, config }: { action: (prev: ActionState, fd: FormData) => Promise<ActionState>; config: SmsFields }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<ProviderConfig["smsMode"]>(config.smsMode);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const cancel = () => { setMode(config.smsMode); setDirty(false); setEditing(false); setVersion((v) => v + 1); };
  return (
    <Card
      title="SMS"
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm key={version} action={action} className="space-y-5" onSuccess={() => { setDirty(false); setEditing(false); }}>
        <fieldset disabled={!editing} className="space-y-5" onChange={() => setDirty(true)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">Mode
              <select name="smsMode" value={mode} onChange={(e) => setMode(e.target.value as ProviderConfig["smsMode"])}>
                <option value="console">Console (test)</option>
                <option value="http">DLT provider (internet)</option>
                <option value="gateway">Android gateway on LAN (offline)</option>
                <option value="off">Off</option>
              </select>
            </label>
            {mode === "http" && <>
              <label className="flex flex-col gap-2">Method<select name="smsMethod" defaultValue={config.smsMethod}><option>GET</option><option>POST</option></select></label>
              <label className="flex flex-col gap-2">Sender ID<input name="smsSenderId" defaultValue={config.smsSenderId} /></label>
              <label className="flex flex-col gap-2 sm:col-span-3">Provider URL<input name="smsUrl" defaultValue={config.smsUrl} placeholder="https://provider/api?to={to}&msg={message}&tid={template_id}&sender={sender}&key=..." /></label>
            </>}
            {mode === "gateway" && <>
              <label className="flex flex-col gap-2 sm:col-span-2">Gateway URL<input name="smsGatewayUrl" defaultValue={config.smsGatewayUrl} placeholder="http://192.168.1.50:8080/message" /></label>
              <label className="flex flex-col gap-2">Gateway auth header<input name="smsGatewayToken" type="password" defaultValue={config.hasSmsGatewayToken ? MASK : ""} /></label>
            </>}
          </div>
        </fieldset>
        {editing && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Submit disabled={!dirty}>Save SMS settings</Submit>
            <button type="button" onClick={cancel} className={buttonClass("secondary")}>Cancel</button>
          </div>
        )}
      </ActionForm>
    </Card>
  );
}
