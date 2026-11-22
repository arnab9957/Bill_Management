"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Notice } from "./ui";
import { GlobalScrollHandler } from "./global-scroll-handler";
import { DateGuards } from "./date-guards";

export interface NavItem { href: string; label: string; key?: string }
export interface YearInfo { id: number; name: string; isCurrent: boolean; currentName: string; options: { id: number; name: string; isCurrent: boolean }[] }
export interface SchoolInfo { address?: string; headerSubtitle?: string; udiseCode?: string }

const ADMIN_HREFS = ["/settings", "/settings/users", "/audit"];

const NAV_ICONS: Record<string, ReactNode> = {
  "/": <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  "/students": <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M17 11h4M17 14h4M17 17h4" /></>,
  "/invoices": <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
  "/fees": <><path d="M4 7h16v11H4z" /><path d="M4 7l2-3h12l2 3" /><circle cx="16" cy="13" r="1.2" /></>,
  "/reports": <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  "/promotion": <><path d="M12 20V5M6 11l6-6 6 6" /><path d="M5 20h14" /></>,
  "/notifications":<><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z" /><path d="M8 10h8M8 13h5" /></>,
  "/settings/users": <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 11h6M19 8v6" /></>,
  "/settings": <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1z" /></>,
  "/audit": <><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4.25 w-4.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {NAV_ICONS[href] ?? <><circle cx="12" cy="12" r="8" /><path d="M12 8v.01M12 11v5" /></>}
    </svg>
  );
}

function UserIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function schoolInitials(school: string) {
  return school.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "FM";
}

function SchoolMark({ school, logo, className }: { school: string; logo?: { hasLogo: boolean; version: string }; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logo?.version]);
  const tile = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent-soft text-[11px] font-bold tracking-wide text-accent-ink";
  const imageTile = "h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-surface object-contain p-1";
  if (logo?.hasLogo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/branding/logo?v=${encodeURIComponent(logo.version)}`} alt={`${school} logo`} onError={() => setFailed(true)} className={`${imageTile} ${className ?? ""}`} />
    );
  }
  return <div role="img" aria-label={`${school} logo`} title={`${school} logo`} className={`${tile} ${className ?? ""}`}>{schoolInitials(school)}</div>;
}

function LiveClock() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    setMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted || !now) {
    return (
      <div className="invisible hidden md:flex items-center gap-4" aria-hidden>
        <span className="flex flex-col items-center gap-1">
          <span className="h-2 w-6 rounded bg-gray-200/70" />
          <span className="h-7 w-8 rounded bg-gray-200/70" />
        </span>
        <span className="h-10 w-px bg-gray-200" />
        <span className="flex flex-col gap-1.5">
          <span className="h-2.5 w-28 rounded bg-gray-200/70" />
          <span className="flex items-center gap-2">
            <span className="h-6 w-24 rounded bg-gray-200/70" />
            <span className="h-2.5 w-8 rounded bg-gray-200/70" />
          </span>
        </span>
      </div>
    );
  }

  const weekday = now.toLocaleDateString("en-IN", { weekday: "long" });
  const day = String(now.getDate()).padStart(2, "0");
  const month = now.toLocaleDateString("en-IN", { month: "short" });
  const year = now.toLocaleDateString("en-IN", { year: "numeric" });

  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hStr = String(hours).padStart(2, "0");
  const mStr = String(now.getMinutes()).padStart(2, "0");
  const sStr = String(now.getSeconds()).padStart(2, "0");

  return (
    <div className="hidden md:flex items-center gap-4" title="Current date and time">
      <div className="flex flex-col items-center leading-none">
        <span className="font-sans text-[9px] font-bold uppercase tracking-[0.2em] text-accent-ink">{month}</span>
        <span className="mt-1 font-sans text-[26px] font-semibold leading-none tracking-tighter tabular-nums text-ink">{day}</span>
      </div>
      <span className="h-10 w-px bg-gray-200" />
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">{weekday}, {year}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-sans text-[20px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{hStr}<span className="mx-0.5 text-gray-300">:</span>{mStr}</span>
          <span className="font-sans text-[10px] font-bold tracking-[0.12em] text-accent-ink">{ampm}</span>
          <span className="font-mono text-[10px] font-medium leading-none text-gray-400">:{sStr}</span>
        </div>
      </div>
    </div>
  );
}

function YearPicker({ year, switchYear }: { year: YearInfo; switchYear: (fd: FormData) => Promise<void> }) {
  return (
    <form action={switchYear} className="flex min-w-0 flex-1 items-center">
      <select
        id="academic-year"
        name="yearId"
        defaultValue={year.id}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Academic session"
        title="Academic session"
        className={`h-9 w-full cursor-pointer rounded-lg border border-chrome-line bg-chrome-soft/70 px-2.5 py-1.5 text-xs sm:text-[13px] font-semibold text-white outline-none transition hover:border-chrome-muted/50 hover:bg-chrome-soft focus:border-chrome-accent focus:bg-chrome focus:ring-2 focus:ring-chrome-accent/25 ${year.isCurrent ? "" : "border-amber-300/30 bg-amber-300/10 font-bold text-amber-200"}`}
      >
        <option value="" disabled className="bg-chrome text-chrome-muted font-medium">
          Academic Sessions
        </option>
        {year.options.map((o) => (
          <option key={o.id} value={o.id} className="bg-white text-gray-900">
            {o.name}{o.isCurrent ? " (current)" : ""}
          </option>
        ))}
      </select>
    </form>
  );
}

export function Shell({ nav, user, school, schoolInfo, logo, children, logout, year, switchYear }: {
  nav: NavItem[]; user: { fullName: string; role: string }; school: string; schoolInfo?: SchoolInfo; logo?: { hasLogo: boolean; version: string }; children: ReactNode; logout: () => Promise<void>;
  year: YearInfo; switchYear: (fd: FormData) => Promise<void>;
}) {
  const path = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [schoolMenuOpen, setSchoolMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const schoolMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPendingHref(null); setMenuOpen(false); setSchoolMenuOpen(false); }, [path]);

  useEffect(() => {
    if (!schoolMenuOpen) return;
    const handleDown = (e: MouseEvent | TouchEvent) => {
      if (schoolMenuRef.current && !schoolMenuRef.current.contains(e.target as Node)) {
        setSchoolMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSchoolMenuOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("touchstart", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("touchstart", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [schoolMenuOpen]);

  const canSettings = nav.some((n) => n.href === "/settings") || user.role === "ADMIN";
  const go = (href: string) => { if (href !== path) setPendingHref(href); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = nav.find((n) => n.key && n.key === e.key.toLowerCase());
      if (item) { e.preventDefault(); go(item.href); router.push(item.href); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, router]);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="no-print sticky top-0 z-40 flex h-20 items-stretch border-b border-gray-200 bg-surface text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:ml-60">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
            className="-ml-2 shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-200/70 hover:text-ink lg:hidden">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <LiveClock />
          <div ref={schoolMenuRef} className="relative ml-auto flex min-w-0 items-center gap-2.5">
            <Link
              href="/"
              title="Go to Dashboard"
              onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) go("/"); }}
              className="group min-w-0 text-right cursor-pointer rounded-lg p-1 -m-1 transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="truncate text-[14px] font-semibold leading-none tracking-[-0.01em] text-ink group-hover:text-accent-ink transition-colors">{school}</div>
              <div className="mt-1 truncate text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-accent-ink">Fees Management</div>
            </Link>
            <button
              type="button"
              onClick={() => setSchoolMenuOpen((v) => !v)}
              aria-expanded={schoolMenuOpen}
              aria-haspopup="true"
              title={`${school} - Click for details and logo`}
              className="group relative cursor-pointer rounded-lg transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95"
            >
              <SchoolMark school={school} logo={logo} className="group-hover:border-accent/40 shadow-xs" />
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-surface text-gray-400 shadow-xs group-hover:text-ink">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </span>
            </button>

            {schoolMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 sm:w-80 rounded-xl border border-gray-200 bg-surface p-4 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-start gap-3 border-b border-gray-100 pb-3">
                  <div
                    onClick={() => { if (logo?.hasLogo) setPreviewOpen(true); }}
                    className={logo?.hasLogo ? "cursor-zoom-in group shrink-0" : "shrink-0"}
                    title={logo?.hasLogo ? "Click to view full logo" : undefined}
                  >
                    <SchoolMark school={school} logo={logo} className="h-11 w-11 text-xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-tight text-ink">{school}</div>
                    {schoolInfo?.headerSubtitle && (
                      <div className="mt-0.5 text-xs text-gray-500 leading-tight">{schoolInfo.headerSubtitle}</div>
                    )}
                    {schoolInfo?.udiseCode && (
                      <div className="mt-1 text-[10px] font-mono font-medium tracking-wide text-gray-500">UDISE: {schoolInfo.udiseCode}</div>
                    )}
                  </div>
                </div>

                {schoolInfo?.address && (
                  <div className="border-b border-gray-100 py-2.5 text-xs text-gray-600 flex items-start gap-2">
                    <svg className="h-3.5 w-3.5 shrink-0 text-gray-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span className="leading-relaxed">{schoolInfo.address}</span>
                  </div>
                )}

                <div className="mt-2.5 space-y-1 text-xs">
                  <Link
                    href="/"
                    onClick={() => setSchoolMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-ink transition hover:bg-gray-100"
                  >
                    <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                    <span>Dashboard</span>
                  </Link>

                  {logo?.hasLogo && (
                    <button
                      type="button"
                      onClick={() => { setSchoolMenuOpen(false); setPreviewOpen(true); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-ink transition hover:bg-gray-100 text-left"
                    >
                      <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      <span>View Full Logo</span>
                    </button>
                  )}

                  {canSettings && (
                    <Link
                      href="/settings?open=school-identity#school-identity"
                      onClick={() => setSchoolMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-ink transition hover:bg-gray-100"
                    >
                      <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                      <span>School Settings & Logo</span>
                    </Link>
                  )}
                </div>

                <div className="mt-3 border-t border-gray-100 pt-2.5 text-xs">
                  <div className="flex items-center justify-between text-gray-500">
                    <span className="truncate">{user.fullName} ({user.role})</span>
                    <form action={logout}>
                      <button type="submit" className="font-semibold text-rose-600 hover:text-rose-700 transition">Sign out</button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {previewOpen && logo?.hasLogo && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative max-h-[85vh] max-w-lg rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-black/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="min-w-0 pr-4">
                <div className="text-base font-bold text-ink truncate">{school}</div>
                <div className="text-xs text-gray-500">Official School Logo</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-ink transition"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex items-center justify-center py-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/branding/logo?v=${encodeURIComponent(logo.version)}`}
                alt={`${school} logo full preview`}
                className="max-h-72 max-w-full rounded-lg object-contain shadow-xs border border-gray-100 p-2 bg-surface"
              />
            </div>
            {canSettings && (
              <div className="border-t border-gray-100 pt-3 flex justify-end gap-2 text-xs">
                <Link
                  href="/settings?open=school-identity#school-identity"
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-ink hover:bg-gray-200 transition"
                >
                  Manage Logo in Settings
                </Link>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-lg bg-ink px-3 py-1.5 font-medium text-white hover:bg-ink/90 transition"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {menuOpen && <div className="no-print fixed inset-x-0 bottom-0 top-20 z-40 bg-chrome/30 backdrop-blur-xs lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="flex lg:pl-60">
        <aside aria-label="Main navigation" className={`no-print fixed bottom-0 left-0 top-0 z-50 flex w-60 shrink-0 flex-col border-r border-chrome-line bg-chrome text-chrome-muted shadow-xl transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-20 shrink-0 items-center gap-2 border-b border-chrome-line bg-chrome-deep/60 px-3 sm:px-4">
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="-ml-1 rounded-md p-1 text-chrome-muted hover:bg-white/10 hover:text-white lg:hidden">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <div className="min-w-0 flex-1">
              <YearPicker year={year} switchYear={switchYear} />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-2.5 py-4">
            <div className="px-3 pb-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-chrome-muted">Workspace</div>
            </div>
            {nav.map((n, i) => {
              const target = pendingHref ?? path;
              // The closest match wins, so /settings/users lights up "Users" and not "School Settings" too.
              const best = nav.filter((x) => (x.href === "/" ? target === "/" : target === x.href || target.startsWith(x.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
              const active = n.href === best;
              const showDivider = i > 0 && ADMIN_HREFS.includes(n.href) && !ADMIN_HREFS.includes(nav[i - 1]?.href ?? "");
              return (
                <div key={n.href}>
                  {showDivider && <div className="mx-2 my-2.5 border-t border-chrome-line" />}
                  <Link href={n.href} aria-current={active ? "page" : undefined} title={n.key ? `Alt+${n.key.toUpperCase()}` : undefined}
                    onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) go(n.href); }}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all duration-150 ${active ? "bg-chrome-soft font-semibold text-white ring-1 ring-white/10" : "font-medium text-chrome-muted hover:bg-white/5 hover:text-white"}`}>
                    {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full bg-chrome-accent" />}
                    <span className={active ? "text-chrome-accent" : "text-chrome-muted group-hover:text-white transition-colors"}><NavIcon href={n.href} /></span>
                    <span className="truncate">{n.label}</span>
                  </Link>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-chrome-line bg-chrome-deep/60 px-3.5 py-3.5">
            <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-chrome-muted">Signed in as</div>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-chrome-accent/30 bg-chrome-accent/10 text-chrome-accent"><UserIcon /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{user.fullName}</div>
                <div className="truncate text-[11px] capitalize text-chrome-muted font-medium">{user.role}</div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between px-1 text-[11px]">
              <Link href="/account/password" className="text-chrome-muted underline-offset-4 hover:text-white hover:underline transition-colors">Password</Link>
              <form action={logout}><button className="text-chrome-muted underline-offset-4 hover:text-white hover:underline transition-colors">Sign out</button></form>
            </div>
          </div>
        </aside>
        <main className="mx-auto min-h-[calc(100vh-5rem)] w-full max-w-[1600px] min-w-0 flex-1 bg-canvas p-5 sm:p-8 lg:p-10" aria-busy={!!pendingHref}>
          <GlobalScrollHandler />
          {!year.isCurrent && (
            <div className="no-print mb-6"><Notice tone="warn">You are viewing academic year <b>{year.name}</b>. The current year is {year.currentName}. Change it in the sidebar.</Notice></div>
          )}
          <DateGuards />
          {children}
        </main>
      </div>
      {pendingHref && <div className="no-print fixed right-0 top-20 z-50 h-0.5 overflow-hidden bg-chrome-line lg:left-60"><div className="h-full w-1/3 animate-[navbar_1s_ease-in-out_infinite] bg-chrome-accent" /></div>}
    </div>
  );
}
