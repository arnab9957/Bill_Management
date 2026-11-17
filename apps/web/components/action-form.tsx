"use client";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

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
  return e ? <p className="text-xs text-red-600">{e}</p> : null;
}

export function Submit({ children, variant = "primary", confirm, name, value }: { children: ReactNode; variant?: "primary" | "danger" | "secondary"; confirm?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  const cls = { primary: "bg-brand-600 text-white hover:bg-brand-700", danger: "bg-red-600 text-white hover:bg-red-700", secondary: "border border-gray-300 bg-white hover:bg-gray-50" }[variant];
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}
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
          <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${state.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`} role="status">
            {state.message}
          </div>
        )}
      </form>
    </ErrCtx.Provider>
    </StateCtx.Provider>
  );
}
