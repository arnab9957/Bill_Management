import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { formatINR } from "@sb/core/src/money-dates-client";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-gray-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-gray-200 bg-white shadow-sm", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const btn = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50",
  secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-brand-700 hover:bg-brand-50",
};
type Variant = keyof typeof btn;

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", btn[variant], className)} {...p} />;
}
export function LinkButton({ variant = "secondary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", btn[variant], className)} {...p} />;
}

export function Field({ label, name, error, hint, className, children }: { label: string; name?: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={name}>{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function Money({ p, className }: { p: number; className?: string }) {
  return <span className={cx("tabular-nums", p < 0 && "text-red-600", className)}>{formatINR(p)}</span>;
}

const badgeColors: Record<string, string> = {
  paid: "bg-green-100 text-green-800", sent: "bg-green-100 text-green-800", valid: "bg-green-100 text-green-800", active: "bg-green-100 text-green-800", cleared: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800", queued: "bg-amber-100 text-amber-800", pending: "bg-amber-100 text-amber-800", sending: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800", failed: "bg-red-100 text-red-800", bounced: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-600", left: "bg-gray-200 text-gray-600", alumni: "bg-gray-200 text-gray-600",
  issued: "bg-blue-100 text-blue-800",
};
export function Badge({ children }: { children: string }) {
  return <span className={cx("inline-block rounded px-1.5 py-0.5 text-xs font-medium capitalize", badgeColors[children] ?? "bg-gray-100 text-gray-700")}>{children.replace(/_/g, " ")}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tabular-nums", tone === "red" && "text-red-700", tone === "green" && "text-green-700")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{children}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const c = { info: "border-blue-200 bg-blue-50 text-blue-900", warn: "border-amber-200 bg-amber-50 text-amber-900", error: "border-red-200 bg-red-50 text-red-900", ok: "border-green-200 bg-green-50 text-green-900" }[tone];
  return <div className={cx("rounded-md border px-3 py-2 text-sm", c)}>{children}</div>;
}
