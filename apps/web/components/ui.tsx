import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatINR } from "@sb/core/src/money-dates-client";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const panelClass = "min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-5">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gray-600">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 no-print">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("eyebrow mb-2", className)}>{children}</h2>;
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx(panelClass, className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className="overflow-x-auto p-5 sm:p-6">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

const buttonVariants: Record<Variant, string> = {
  primary: "bg-blue-600 text-white shadow-xs hover:bg-blue-700",
  secondary: "border border-gray-300 bg-surface text-gray-800 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-900",
  danger: "bg-red-700 text-white shadow-sm hover:bg-red-800",
  ghost: "text-ink hover:bg-blue-50 hover:text-blue-900",
};
const buttonSizes: Record<Size, string> = { md: "px-4 py-2.5 text-sm", sm: "px-3 py-1.5 text-sm" };
const buttonBase = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return cx(buttonBase, buttonSizes[size], buttonVariants[variant]);
}

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cx(buttonClass(variant, size), className)} {...p} />;
}
export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cx(buttonClass(variant, size), className)} {...p} />;
}

export function Field({ label, name, error, hint, className, children }: { label: string; name?: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx("field-stack", className)}>
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? <p className="text-xs font-medium text-red-700">{error}</p> : hint ? <p className="text-xs leading-relaxed text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function Money({ p, className }: { p: number; className?: string }) {
  return <span className={cx("tabular-nums", p < 0 && "text-red-700", className)}>{formatINR(p)}</span>;
}

const badgeColors: Record<string, string> = {
  paid: "border-brand-200 bg-brand-50 text-brand-900", sent: "border-brand-200 bg-brand-50 text-brand-900", valid: "border-brand-200 bg-brand-50 text-brand-900", active: "border-brand-200 bg-brand-50 text-brand-900", cleared: "border-brand-200 bg-brand-50 text-brand-900",
  partial: "border-amber-200 bg-amber-50 text-amber-900", queued: "border-amber-200 bg-amber-50 text-amber-900", pending: "border-amber-200 bg-amber-50 text-amber-900", sending: "border-amber-200 bg-amber-50 text-amber-900",
  overdue: "border-red-200 bg-red-50 text-red-800", failed: "border-red-200 bg-red-50 text-red-800", bounced: "border-red-200 bg-red-50 text-red-800",
  cancelled: "border-gray-200 bg-gray-100 text-gray-600", left: "border-gray-200 bg-gray-100 text-gray-600", alumni: "border-gray-200 bg-gray-100 text-gray-600",
  issued: "border-blue-200 bg-blue-50 text-blue-800",
};
export function Badge({ children }: { children: string }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]", badgeColors[children] ?? "border-gray-200 bg-gray-100 text-gray-700")}>{children.replace(/_/g, " ")}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className={cx(panelClass, "p-5 sm:p-6")}>
      <div className="eyebrow">{label}</div>
      <div className={cx("mt-3 wrap-break-word text-2xl font-semibold tracking-tight tabular-nums text-ink sm:text-[28px]", tone === "red" && "text-red-700", tone === "green" && "text-ink")}>{value}</div>
      {sub && <div className="mt-2 text-xs leading-relaxed text-gray-500">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-10 text-center text-sm leading-relaxed text-gray-500">{children}</div>;
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-500">{children}</td></tr>;
}

export function Notice({ tone = "info", className, role, children }: { tone?: "info" | "warn" | "error" | "ok"; className?: string; role?: "status" | "alert"; children: ReactNode }) {
  const c = { info: "border-gray-200 bg-surface text-gray-700", warn: "border-amber-200 bg-amber-50 text-amber-900", error: "border-red-200 bg-red-50 text-red-900", ok: "border-brand-200 bg-brand-50 text-brand-900" }[tone];
  return <div role={role} className={cx("rounded-lg border px-4 py-3 text-sm leading-relaxed shadow-sm", c, className)}>{children}</div>;
}
