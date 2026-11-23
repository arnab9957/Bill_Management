"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cx, panelClass } from "@/components/ui";

type SectionState = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  openSection: (id: string) => void;
  toggle: (id: string) => void;
};
const SectionContext = createContext<SectionState | null>(null);

export function SectionCollapseProvider({ children }: { children: ReactNode }) {
  // All sections closed by default; only one section can be open at a time
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

  const openSection = (id: string) => {
    setOpenId(id);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  };

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <SectionContext.Provider value={{ openId, setOpenId, openSection, toggle }}>
      {children}
    </SectionContext.Provider>
  );
}

export function useSectionCollapse(id: string) {
  const ctx = useContext(SectionContext);
  if (!ctx) throw new Error("SectionCollapseProvider is required");
  return {
    open: ctx.openId === id,
    toggle: () => ctx.toggle(id),
  };
}

export function SettingsQuickNav({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  const ctx = useContext(SectionContext);
  if (!ctx) return null;

  return (
    <nav
      className="no-print flex overflow-x-auto pb-1.5 pt-0.5 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap items-center gap-1.5 text-xs select-none"
      aria-label="Settings quick navigation"
    >
      {items.map((item) => {
        const isActive = ctx.openId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => ctx.openSection(item.id)}
            className={cx(
              "shrink-0 inline-flex items-center rounded-lg px-3 py-1.5 font-medium transition-all duration-150 cursor-pointer text-xs",
              isActive
                ? "bg-accent text-white shadow-xs font-semibold"
                : "border border-gray-200 bg-surface text-gray-700 shadow-2xs hover:border-accent/40 hover:bg-tint/60 hover:text-accent-ink"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CollapsibleSection({
  id,
  title,
  subtitle,
  children,
  actions,
  overflowVisible,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  overflowVisible?: boolean;
}) {
  const { open, toggle } = useSectionCollapse(id);
  const sectionRef = useRef<HTMLElement>(null);

  const handleToggle = () => {
    const willOpen = !open;
    toggle();
    if (willOpen) {
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  };

  return (
    <section
      ref={sectionRef}
      id={id}
      className={cx(
        panelClass,
        "scroll-mt-24 transition-all duration-150",
        overflowVisible && "!overflow-visible"
      )}
    >
      <div
        className={cx(
          "flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 sm:px-6 sm:py-3.5 bg-subtle/70 transition-colors",
          open && "border-b border-gray-200/70"
        )}
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={`settings-section-${id}`}
          className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex-1 pr-1">
            <span className="block truncate text-sm font-semibold tracking-tight text-ink group-hover:text-accent-ink transition-colors">
              {title}
            </span>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-500 leading-relaxed line-clamp-2 sm:line-clamp-none">
                {subtitle}
              </p>
            )}
          </div>
          <span
            className={cx(
              "grid h-7 w-7 sm:h-6 sm:w-6 shrink-0 place-items-center rounded-md border text-gray-400 transition-colors",
              open
                ? "border-accent/20 bg-accent-soft text-accent-ink"
                : "border-gray-200 bg-white group-hover:border-accent/30 group-hover:text-accent-ink"
            )}
          >
            <Chevron open={open} />
          </span>
        </button>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {open && (
        <div
          id={`settings-section-${id}`}
          className={cx("p-4 sm:p-6", overflowVisible && "overflow-visible")}
        >
          {children}
        </div>
      )}
    </section>
  );
}
