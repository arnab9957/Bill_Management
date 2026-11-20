"use client";
import { useEffect, useState } from "react";
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
  const [formValues, setFormValues] = useState({
    smsMethod: config.smsMethod,
    smsSenderId: config.smsSenderId,
    smsUrl: config.smsUrl,
    smsGatewayUrl: config.smsGatewayUrl,
    smsGatewayToken: config.hasSmsGatewayToken ? MASK : "",
  });

  useEffect(() => {
    setMode(config.smsMode);
    setFormValues({
      smsMethod: config.smsMethod,
      smsSenderId: config.smsSenderId,
      smsUrl: config.smsUrl,
      smsGatewayUrl: config.smsGatewayUrl,
      smsGatewayToken: config.hasSmsGatewayToken ? MASK : "",
    });
  }, [config]);

  const cancel = () => {
    setMode(config.smsMode);
    setDirty(false);
    setEditing(false);
    setFormValues({
      smsMethod: config.smsMethod,
      smsSenderId: config.smsSenderId,
      smsUrl: config.smsUrl,
      smsGatewayUrl: config.smsGatewayUrl,
      smsGatewayToken: config.hasSmsGatewayToken ? MASK : "",
    });
  };

  return (
    <Card
      title="SMS"
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm
        action={action}
        className="space-y-5"
        onSuccess={() => {
          setDirty(false);
          setEditing(false);
        }}
      >
        <fieldset disabled={!editing} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2">Mode
              <select
                name="smsMode"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as ProviderConfig["smsMode"]);
                  setDirty(true);
                }}
              >
                <option value="console">Console (test)</option>
                <option value="http">DLT provider (internet)</option>
                <option value="gateway">Android gateway on LAN (offline)</option>
                <option value="off">Off</option>
              </select>
            </label>
            {mode === "http" && <>
              <label className="flex flex-col gap-2">Method
                <select
                  name="smsMethod"
                  value={formValues.smsMethod}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smsMethod: e.target.value as ProviderConfig["smsMethod"] })); setDirty(true); }}
                >
                  <option>GET</option>
                  <option>POST</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">Sender ID
                <input
                  name="smsSenderId"
                  value={formValues.smsSenderId}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smsSenderId: e.target.value })); setDirty(true); }}
                />
              </label>
              <label className="flex flex-col gap-2 sm:col-span-3">Provider URL
                <input
                  name="smsUrl"
                  value={formValues.smsUrl}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smsUrl: e.target.value })); setDirty(true); }}
                  placeholder="https://provider/api?to={to}&msg={message}&tid={template_id}&sender={sender}&key=..."
                />
              </label>
            </>}
            {mode === "gateway" && <>
              <label className="flex flex-col gap-2 sm:col-span-2">Gateway URL
                <input
                  name="smsGatewayUrl"
                  value={formValues.smsGatewayUrl}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smsGatewayUrl: e.target.value })); setDirty(true); }}
                  placeholder="http://192.168.1.50:8080/message"
                />
              </label>
              <label className="flex flex-col gap-2">Gateway auth header
                <input
                  name="smsGatewayToken"
                  type="password"
                  value={formValues.smsGatewayToken}
                  onChange={(e) => { setFormValues((v) => ({ ...v, smsGatewayToken: e.target.value })); setDirty(true); }}
                />
              </label>
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
