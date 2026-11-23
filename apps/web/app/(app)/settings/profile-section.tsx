"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { buttonClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action";
import { CollapsibleSection, useSectionCollapse } from "./section-collapse";

export function ProfileSection({
  id,
  title,
  subtitle,
  action,
  children,
  className,
  saveLabel,
  cancelLabel,
}: {
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
  const [version, setVersion] = useState(0);

  const effectiveSaveLabel = saveLabel ?? `Save ${title.toLowerCase()}`;
  const effectiveCancelLabel = cancelLabel ?? "Cancel";

  const cancel = () => {
    setEditing(false);
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setVersion((v) => v + 1);
    }
  }, [open]);

  return (
    <CollapsibleSection
      id={id}
      title={title}
      subtitle={subtitle}
      actions={
        open ? (
          !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink shadow-2xs hover:bg-accent hover:text-white transition-all cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L4.5 13.5l-3 1 1-3 9-9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Edit
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Editing
            </span>
          )
        ) : undefined
      }
    >
      <ActionForm
        key={version}
        action={action}
        className={`space-y-5 ${className ?? ""}`}
        onSuccess={() => {
          setEditing(false);
        }}
      >
        <fieldset disabled={!editing} className="grid gap-4 sm:grid-cols-2">
          {children}
        </fieldset>
        {editing && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={cancel}
              className={cx(buttonClass("secondary"), "cursor-pointer text-xs py-1.5 px-3.5")}
            >
              {effectiveCancelLabel}
            </button>
            <Submit className="text-xs py-1.5 px-3.5">
              {effectiveSaveLabel}
            </Submit>
          </div>
        )}
      </ActionForm>
    </CollapsibleSection>
  );
}
