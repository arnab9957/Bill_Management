"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx, panelClass } from "@/components/ui";

type SectionState = { openId: string | null; setOpenId: (id: string | null) => void };
const SectionContext = createContext<SectionState | null>(null);

export function SectionCollapseProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const handleTarget = () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(window.location.search);
      const target = hash || params.get("open") || params.get("section");
      if (target) {
        setOpenId(target);
        let attempts = 0;
        const scroll = () => {
          const el = document.getElementById(target);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          } else if (attempts < 10) {
            attempts++;
            setTimeout(scroll, 50);
          }
        };
        setTimeout(scroll, 50);
      }
    };

    handleTarget();
    window.addEventListener("hashchange", handleTarget);
    window.addEventListener("popstate", handleTarget);
    return () => {
      window.removeEventListener("hashchange", handleTarget);
      window.removeEventListener("popstate", handleTarget);
    };
  }, []);

  return <SectionContext.Provider value={{ openId, setOpenId }}>{children}</SectionContext.Provider>;
}

export function useSectionCollapse(id: string) {
  const ctx = useContext(SectionContext);
  if (!ctx) throw new Error("SectionCollapseProvider is required");
  return { open: ctx.openId === id, toggle: () => ctx.setOpenId(ctx.openId === id ? null : id) };
}

function Chevron({ open }: { open: boolean }) {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
    <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function CollapsibleSection({ id, title, subtitle, children, actions }: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { open, toggle } = useSectionCollapse(id);
  const sectionRef = useRef<HTMLElement>(null);

  const handleToggle = () => {
    const willOpen = !open;
    toggle();
    if (willOpen) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  return (
    <section ref={sectionRef} id={id} className={cx(panelClass, "scroll-mt-24 transition-shadow hover:shadow-[0_6px_20px_-14px_rgba(16,24,40,0.22)]")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/70 px-5 py-4 sm:px-6">
        <button type="button" onClick={handleToggle} aria-expanded={open} aria-controls={`settings-section-${id}`} className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors", open ? "border-accent/20 bg-accent-soft text-accent-ink" : "border-gray-200 bg-subtle text-gray-500 group-hover:border-accent/40 group-hover:text-accent-ink")}>
            <Chevron open={open} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-tight text-ink">{title}</span>
            {subtitle && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{subtitle}</span>}
          </span>
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {open && <div id={`settings-section-${id}`} className="p-5 sm:p-6">{children}</div>}
    </section>
  );
}
