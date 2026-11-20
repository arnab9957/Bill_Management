"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Notice } from "./ui";

export interface NavItem { href: string; label: string; key?: string }
export interface YearInfo { id: number; name: string; isCurrent: boolean; currentName: string; options: { id: number; name: string; isCurrent: boolean }[] }

const ADMIN_HREFS = ["/settings", "/audit"];

const NAV_ICONS: Record<string, ReactNode> = {
  "/": <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  "/students": <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M17 11h4M17 14h4M17 17h4" /></>,
  "/invoices": <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
  "/fees": <><path d="M4 7h16v11H4z" /><path d="M4 7l2-3h12l2 3" /><circle cx="16" cy="13" r="1.2" /></>,
  "/reports": <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  "/notifications": <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2.2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z" /><path d="M8 10h8M8 13h5" /></>,
  "/settings": <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1z" /></>,
  "/audit": <><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function SchoolMark({ school, logo }: { school: string; logo?: { hasLogo: boolean; version: string } }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logo?.version]);
  const tile = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold tracking-wide text-navy";
  const imageTile = "h-9 w-9 shrink-0 rounded-lg border border-white/15 bg-white object-contain p-1";
  if (logo?.hasLogo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/branding/logo?v=${encodeURIComponent(logo.version)}`} alt={`${school} logo`} onError={() => setFailed(true)} className={imageTile} />
    );
  }
  return <div role="img" aria-label={`${school} logo`} title={`${school} logo`} className={tile}>{schoolInitials(school)}</div>;
}

function YearPicker({ year, switchYear }: { year: YearInfo; switchYear: (fd: FormData) => Promise<void> }) {
  return (
    <form action={switchYear} className="flex min-w-0 flex-1 items-center gap-2">
      <label htmlFor="academic-year" className="shrink-0 text-[9px] font-bold uppercase leading-[1.1] tracking-[0.14em] text-navy/50">
        <span className="block">Academic</span>
        <span className="block">Session</span>
      </label>
      <select id="academic-year" name="yearId" defaultValue={year.id} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Academic session"
        className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-xs font-semibold shadow-none focus:border-0 focus:ring-0 focus-visible:underline ${year.isCurrent ? "text-navy" : "text-amber-700"}`}>
        {year.options.map((o) => <option key={o.id} value={o.id} className="bg-white text-ink">{o.name}{o.isCurrent ? " (current)" : ""}</option>)}
      </select>
    </form>
  );
}

export function Shell({ nav, user, school, logo, children, logout, year, switchYear }: {
  nav: NavItem[]; user: { fullName: string; role: string }; school: string; logo?: { hasLogo: boolean; version: string }; children: ReactNode; logout: () => Promise<void>;
  year: YearInfo; switchYear: (fd: FormData) => Promise<void>;
}) {
  const path = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setPendingHref(null); setMenuOpen(false); }, [path]);
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
      <header className="no-print sticky top-0 z-50 flex h-20 items-stretch bg-navy text-white shadow-sm">
        <div className="flex w-60 shrink-0 items-center gap-2 px-3 sm:px-4">
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
            className="-ml-1 rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white lg:hidden">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2 text-navy">
            <YearPicker year={year} switchYear={switchYear} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 px-3 sm:px-6">
          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-semibold text-white">{school}</div>
            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Fees Management</div>
          </div>
          <SchoolMark school={school} logo={logo} />
        </div>
      </header>
      {menuOpen && <div className="no-print fixed inset-x-0 bottom-0 top-20 z-40 bg-navy/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="flex">
        <aside aria-label="Main navigation" className={`no-print fixed bottom-0 left-0 top-20 z-50 flex w-60 shrink-0 flex-col border-r border-white/10 bg-navy text-white shadow-xl transition-transform duration-200 lg:sticky lg:top-20 lg:z-auto lg:h-[calc(100vh-5rem)] lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <nav className="flex-1 overflow-y-auto px-2.5 py-4">
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Workspace</div>
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white lg:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {nav.map((n, i) => {
              const target = pendingHref ?? path;
              const active = n.href === "/" ? target === "/" : target.startsWith(n.href);
              const showDivider = i > 0 && ADMIN_HREFS.includes(n.href) && !ADMIN_HREFS.includes(nav[i - 1]?.href ?? "");
              return (
                <div key={n.href}>
                  {showDivider && <div className="mx-2 my-2 border-t border-white/10" />}
                  <Link href={n.href} aria-current={active ? "page" : undefined} title={n.key ? `Alt+${n.key.toUpperCase()}` : undefined}
                    onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) go(n.href); }}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors duration-150 ${active ? "bg-white/10 font-semibold text-white ring-1 ring-white/10" : "font-medium text-white/70 hover:bg-white/10 hover:text-white"}`}>
                    {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r-full bg-accent" />}
                    <span className={active ? "text-white" : "text-white/45 group-hover:text-white"}><NavIcon href={n.href} /></span>
                    <span className="truncate">{n.label}</span>
                  </Link>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-white/10 bg-navy-soft/50 px-3 py-3">
            <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Signed in as</div>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/70"><UserIcon /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">{user.fullName}</div>
                <div className="truncate text-[11px] capitalize text-white/55">{user.role}</div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between px-1 text-[11px]">
              <Link href="/account/password" className="text-white/55 underline-offset-4 hover:text-white hover:underline">Password</Link>
              <form action={logout}><button className="text-white/55 underline-offset-4 hover:text-white hover:underline">Sign out</button></form>
            </div>
          </div>
        </aside>
        <main className={`mx-auto min-h-[calc(100vh-5rem)] w-full max-w-[1600px] min-w-0 flex-1 bg-canvas p-5 transition-opacity sm:p-8 lg:p-10 ${pendingHref ? "pointer-events-none opacity-50" : ""}`} aria-busy={!!pendingHref}>
          {!year.isCurrent && (
            <div className="no-print mb-6"><Notice tone="warn">You are viewing academic year <b>{year.name}</b>. The current year is {year.currentName}. Change it in the top bar.</Notice></div>
          )}
          {children}
        </main>
      </div>
      {pendingHref && <div className="no-print fixed inset-x-0 top-20 z-50 h-1 overflow-hidden bg-white/20"><div className="h-full w-1/3 animate-[navbar_1s_ease-in-out_infinite] bg-accent" /></div>}
    </div>
  );
}
