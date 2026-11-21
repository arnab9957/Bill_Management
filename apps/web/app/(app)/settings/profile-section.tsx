"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { CollapsibleSection, useSectionCollapse } from "./section-collapse";

export function ProfileSection({ id, title, subtitle, action, children, className, saveLabel, cancelLabel }: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  saveLabel?: string;
  cancelLabel?: string;
}) {
  const { open } = useSectionCollapse(id);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const cancel = () => { setDirty(false); setEditing(false); setVersion((v) => v + 1); };
  const effectiveSaveLabel = saveLabel ?? `Save ${title.toLowerCase()}`;
  const effectiveCancelLabel = cancelLabel ?? "Cancel";

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setDirty(false);
      setVersion((v) => v + 1);
    }
  }, [open]);

  return (
    <CollapsibleSection
      id={id}
      title={title}
      subtitle={subtitle}
      actions={open && !editing ? <button type="button" onClick={() => { setEditing(true); setDirty(false); }} className={`${buttonClass("secondary")} cursor-pointer`}>Edit</button> : undefined}
    >
      <ActionForm key={version} action={action} className={`space-y-5 ${className ?? ""}`} onSuccess={() => { setDirty(false); setEditing(false); }}>
        <fieldset disabled={!editing} onChange={() => setDirty(true)} className="grid gap-4 sm:grid-cols-2">{children}</fieldset>
        {editing && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Submit disabled={!dirty}>{effectiveSaveLabel}</Submit>
            <button type="button" onClick={cancel} className={`${buttonClass("secondary")} cursor-pointer`}>{effectiveCancelLabel}</button>
          </div>
        )}
      </ActionForm>
    </CollapsibleSection>
  );
}
