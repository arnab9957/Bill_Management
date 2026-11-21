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
  const errs = useContext(ErrCtx);
  if (errs[name]) return errs[name];
  if (name.includes(".")) {
    const short = name.split(".").pop()!;
    if (errs[short]) return errs[short];
  } else {
    if (errs[`guardian.${name}`]) return errs[`guardian.${name}`];
  }
  return undefined;
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
  action, children, className, resetOnSuccess, onSuccess, id,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (s: NonNullable<ActionState>) => void;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const lastStateRef = useRef<ActionState>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const isScrollingInvalidRef = useRef(false);

  // Form submit is guarded until hydrated, but inputs remain fully interactive immediately
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (state !== lastStateRef.current) {
      lastStateRef.current = state;
      if (state?.ok) {
        if (resetOnSuccess) ref.current?.reset();
        onSuccessRef.current?.(state);
      } else if (state && state.ok === false && ref.current) {
        // Auto-scroll globally to the first invalid field or error banner
        const form = ref.current;
        let targetEl: HTMLElement | null = null;

        if (state.errors && Object.keys(state.errors).length > 0) {
          for (const key of Object.keys(state.errors)) {
            const short = key.includes(".") ? key.split(".").pop()! : key;
            const el = form.querySelector<HTMLElement>(
              `[name="${key}"], [name="${short}"], [name="guardian.${short}"]`
            );
            if (el) {
              targetEl = el;
              break;
            }
          }
        }

        if (!targetEl) {
          targetEl = form.querySelector<HTMLElement>(
            '[aria-invalid="true"], :invalid, .text-red-700, [role="status"]'
          );
        }

        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
          if (typeof targetEl.focus === "function") {
            try {
              targetEl.focus({ preventScroll: true });
            } catch {
              // ignore
            }
          }
          targetEl.classList.add("auto-scroll-highlight");
          setTimeout(() => targetEl?.classList.remove("auto-scroll-highlight"), 2000);
        }
      }
    }
  }, [state, resetOnSuccess]);

  const handleInvalidCapture = (e: React.FormEvent<HTMLFormElement>) => {
    if (isScrollingInvalidRef.current) return;
    isScrollingInvalidRef.current = true;
    const target = e.target as HTMLElement;
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("auto-scroll-highlight");
      setTimeout(() => {
        target.classList.remove("auto-scroll-highlight");
        isScrollingInvalidRef.current = false;
      }, 1200);
    } else {
      isScrollingInvalidRef.current = false;
    }
  };

  return (
    <StateCtx.Provider value={state}>
    <ErrCtx.Provider value={state?.errors ?? {}}>
      <form
        ref={ref}
        id={id}
        action={formAction}
        className={className}
        aria-busy={!ready}
        onInvalidCapture={handleInvalidCapture}
        onSubmit={(e) => {
          if (!ready) {
            e.preventDefault();
          }
        }}
      >
        <fieldset className="contents">{children}</fieldset>
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
