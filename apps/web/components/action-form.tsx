"use client";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";
import { buttonClass, cx, Notice } from "./ui";

const ErrCtx = createContext<Record<string, string>>({});
const StateCtx = createContext<ActionState>(null);
/** The last result of the nearest ActionForm (e.g. to render returned data). */
export function useActionResult() {
  return useContext(StateCtx);
}
/** Field error for `name` from the nearest ActionForm. */
export function useFieldError(name: string) {
  return useContext(ErrCtx)[name];
}
export function FieldError({ name }: { name: string }) {
  const e = useFieldError(name);
  return e ? <p className="text-xs font-medium text-red-700">{e}</p> : null;
}

export function Submit({ children, variant = "primary", confirm, name, value, className, disabled }: { children: ReactNode; variant?: "primary" | "danger" | "secondary"; confirm?: string; name?: string; value?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={cx(buttonClass(variant), className)}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

/**
 * A form bound to a server action returning ActionState. Shows the message,
 * exposes field errors to <FieldError>, and optionally resets on success.
 */
export function ActionForm({
  action, children, className, resetOnSuccess, onSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: NonNullable<ActionState>) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  // Until the page's JavaScript has loaded, the form is disabled. A submit before that would be a
  // plain HTML post, which Next.js can't route to these actions (500 "reading 'bind'").
  // On a slow link (e.g. a shared demo URL) people can otherwise click before the page is ready.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  return (
    <StateCtx.Provider value={state}>
    <ErrCtx.Provider value={state?.errors ?? {}}>
      <form ref={ref} action={formAction} className={className} aria-busy={!ready}>
        <fieldset disabled={!ready} className="contents">{children}</fieldset>
        {state?.message && (
          <Notice tone={state.ok ? "ok" : "error"} className="mt-5" role="status">
            {state.message}
          </Notice>
        )}
      </form>
    </ErrCtx.Provider>
    </StateCtx.Provider>
  );
}
