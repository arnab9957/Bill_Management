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
  const tile = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200/80 bg-blue-50/80 text-xs font-bold tracking-wide text-blue-900 shadow-2xs";
  const imageTile = "h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white object-contain p-1 shadow-2xs";
  if (logo?.hasLogo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/branding/logo?v=${encodeURIComponent(logo.version)}`} alt={`${school} logo`} onError={() => setFailed(true)} className={imageTile} />
    );
  }
  return <div role="img" aria-label={`${school} logo`} title={`${school} logo`} className={tile}>{schoolInitials(school)}</div>;
}

function CalendarIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
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
      <div className="hidden md:flex flex-col justify-center border-l border-gray-200/80 pl-4 py-0.5 opacity-0 pointer-events-none" aria-hidden>
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">&nbsp;</span>
        <span className="text-sm font-semibold">&nbsp;</span>
      </div>
    );
  }

  const dayDate = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hStr = String(hours).padStart(2, "0");
  const mStr = String(now.getMinutes()).padStart(2, "0");
  const sStr = String(now.getSeconds()).padStart(2, "0");
  const timeFormatted = `${hStr}:${mStr}:${sStr} ${ampm}`;

  return (
    <div className="hidden md:flex flex-col justify-center gap-0.5 border-l border-gray-200/90 pl-4 sm:pl-5 py-0.5" title="Current date and time">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 whitespace-nowrap">
        <CalendarIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span>{dayDate}</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm sm:text-[15px] font-bold tracking-tight text-gray-850 whitespace-nowrap">
        <ClockIcon className="h-3.5 w-3.5 text-accent-ink shrink-0" />
        <span className="font-mono text-gray-900">{timeFormatted}</span>
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
        className={`h-9 w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-1.5 text-xs sm:text-[13px] font-semibold shadow-2xs outline-none transition hover:bg-gray-100/70 hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 ${year.isCurrent ? "text-gray-900" : "text-amber-800 bg-amber-50/70 border-amber-200 font-bold"}`}
      >
        <option value="" disabled className="text-gray-400 font-medium">
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
      <header className="no-print sticky top-0 z-50 flex h-20 items-stretch border-b border-gray-200/80 bg-white text-gray-900 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
        <div className="flex w-60 shrink-0 items-center gap-2 border-r border-gray-200/80 px-3 sm:px-4 bg-white">
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
            className="-ml-1 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0 flex-1">
            <YearPicker year={year} switchYear={switchYear} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 sm:px-6">
          <LiveClock />
          <div className="flex min-w-0 items-center gap-3 ml-auto">
            <div className="min-w-0 text-right">
              <div className="truncate text-sm sm:text-[15px] font-bold tracking-tight text-gray-900">{school}</div>
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Fees Management</div>
            </div>
            <SchoolMark school={school} logo={logo} />
          </div>
        </div>
      </header>
      {menuOpen && <div className="no-print fixed inset-x-0 bottom-0 top-20 z-40 bg-gray-900/20 backdrop-blur-xs lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="flex">
        <aside aria-label="Main navigation" className={`no-print fixed bottom-0 left-0 top-20 z-50 flex w-60 shrink-0 flex-col border-r border-gray-200/80 bg-white text-gray-800 shadow-xl transition-transform duration-200 lg:sticky lg:top-20 lg:z-auto lg:h-[calc(100vh-5rem)] lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <nav className="flex-1 overflow-y-auto px-2.5 py-4">
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Workspace</div>
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:hidden">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {nav.map((n, i) => {
              const target = pendingHref ?? path;
              const active = n.href === "/" ? target === "/" : target.startsWith(n.href);
              const showDivider = i > 0 && ADMIN_HREFS.includes(n.href) && !ADMIN_HREFS.includes(nav[i - 1]?.href ?? "");
              return (
                <div key={n.href}>
                  {showDivider && <div className="mx-2 my-2.5 border-t border-gray-100" />}
                  <Link href={n.href} aria-current={active ? "page" : undefined} title={n.key ? `Alt+${n.key.toUpperCase()}` : undefined}
                    onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) go(n.href); }}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all duration-150 ${active ? "bg-blue-50/80 font-semibold text-blue-900 shadow-2xs ring-1 ring-blue-100" : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
                    {active && <span className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full bg-blue-600" />}
                    <span className={active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600 transition-colors"}><NavIcon href={n.href} /></span>
                    <span className="truncate">{n.label}</span>
                  </Link>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-gray-200/80 bg-gray-50/70 px-3.5 py-3.5">
            <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Signed in as</div>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200/80 bg-blue-50/70 text-blue-700 shadow-2xs"><UserIcon /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-gray-900">{user.fullName}</div>
                <div className="truncate text-[11px] capitalize text-gray-500 font-medium">{user.role}</div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between px-1 text-[11px]">
              <Link href="/account/password" className="text-gray-500 underline-offset-4 hover:text-gray-800 hover:underline transition-colors">Password</Link>
              <form action={logout}><button className="text-gray-500 underline-offset-4 hover:text-gray-800 hover:underline transition-colors">Sign out</button></form>
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
      {pendingHref && <div className="no-print fixed inset-x-0 top-20 z-50 h-0.5 overflow-hidden bg-blue-100"><div className="h-full w-1/3 animate-[navbar_1s_ease-in-out_infinite] bg-blue-600" /></div>}
    </div>
  );
}
