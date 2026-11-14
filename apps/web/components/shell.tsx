"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export interface NavItem { href: string; label: string; key?: string }

/** Sidebar + global keyboard shortcuts (Alt+key). */
export function Shell({ nav, user, school, children, logout }: {
  nav: NavItem[]; user: { fullName: string; role: string }; school: string; children: ReactNode; logout: () => Promise<void>;
}) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = nav.find((n) => n.key && n.key === e.key.toLowerCase());
      if (item) { e.preventDefault(); router.push(item.href); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, router]);

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <div className="truncate text-sm font-semibold text-brand-900">{school}</div>
          <div className="text-xs text-gray-500">Fee Billing</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {nav.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                {n.label}
                {n.key && <kbd className="text-[10px] text-gray-400">Alt+{n.key.toUpperCase()}</kbd>}
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
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
