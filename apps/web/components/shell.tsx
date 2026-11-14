"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export interface NavItem { href: string; label: string; key?: string }

/** Sidebar + global keyboard shortcuts (Alt+key). */
export function Shell({ nav, user, school, children, logout }: {
  nav: NavItem[]; user: { fullName: string; role: string }; school: string; children: ReactNode; logout: () => Promise<void>;
}) {
  const path = usePathname();
  const router = useRouter();
  // Instant feedback on menu clicks: progress bar + dimmed page until the new route renders.
  // (Not done with loading.tsx: in Next 15 production builds that makes form actions hang.)
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Phone / tablet top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2 lg:hidden">
        <button type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}
          className="rounded-md p-2 text-gray-700 hover:bg-gray-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-brand-900">{school}</div>
          <div className="truncate text-xs text-gray-500">{nav.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)))?.label ?? "Fee Billing"}</div>
        </div>
      </header>
      {menuOpen && <div className="no-print fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={`no-print fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:w-56 lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-900">{school}</div>
            <div className="text-xs text-gray-500">Fee Billing</div>
          </div>
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {nav.map((n) => {
            const target = pendingHref ?? path;
            const active = n.href === "/" ? target === "/" : target.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) go(n.href); }}
                className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm lg:py-1.5 ${active ? "bg-brand-50 font-medium text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                {n.label}
                {n.key && <kbd className="hidden text-[10px] text-gray-400 lg:inline">Alt+{n.key.toUpperCase()}</kbd>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-3 text-xs">
          <div className="font-medium text-gray-800">{user.fullName}</div>
          <div className="text-gray-500">{user.role}</div>
          <div className="mt-2 flex gap-3">
            <Link href="/account/password" className="text-brand-700 hover:underline">Password</Link>
            <form action={logout}><button className="text-brand-700 hover:underline">Sign out</button></form>
          </div>
        </div>
      </aside>
      {pendingHref && <div className="no-print fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-brand-100"><div className="h-full w-1/3 animate-[navbar_1s_ease-in-out_infinite] bg-brand-600" /></div>}
      <main className={`min-w-0 flex-1 p-3 transition-opacity sm:p-6 ${pendingHref ? "pointer-events-none opacity-50" : ""}`} aria-busy={!!pendingHref}>{children}</main>
    </div>
  );
}
