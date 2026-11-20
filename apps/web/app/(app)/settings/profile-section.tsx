"use client";
import { useState, type ReactNode } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { buttonClass, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function ProfileSection({ title, action, children, className }: {
  title: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const cancel = () => { setDirty(false); setEditing(false); setVersion((v) => v + 1); };
  return (
    <Card
      title={title}
      actions={!editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={buttonClass("secondary")}>Edit</button> : undefined}
    >
      <ActionForm key={version} action={action} className={`space-y-5 ${className ?? ""}`} onSuccess={() => { setDirty(false); setEditing(false); }}>
        <fieldset disabled={!editing} onChange={() => setDirty(true)} className="grid gap-4 sm:grid-cols-2">{children}</fieldset>
        {editing && (
          <div className="flex flex-wrap gap-3">
            <Submit disabled={!dirty}>Save</Submit>
            <button type="button" onClick={cancel} className={buttonClass("secondary")}>Cancel</button>
          </div>
        )}
      </ActionForm>
    </Card>
  );
}
