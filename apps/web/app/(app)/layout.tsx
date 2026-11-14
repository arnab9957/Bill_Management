import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { accounts, can, getSettings, type Permission } from "@sb/core";
import { getUser, SESSION_COOKIE } from "@/lib/auth";
import { Shell, type NavItem } from "@/components/shell";
import { getWorkingYear, YEAR_COOKIE } from "@/lib/year";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/", label: "Dashboard", perm: "dashboard", key: "d" },
  { href: "/collect", label: "Collect fee", perm: "collect", key: "c" },
  { href: "/students", label: "Students", perm: "students", key: "s" },
  { href: "/invoices", label: "Bills", perm: "billing", key: "b" },
  { href: "/billing", label: "Bill run", perm: "billing" },
  { href: "/daybook", label: "Day book & closing", perm: "dayClose", key: "y" },
  { href: "/cheques", label: "Cheques", perm: "receiptsCancel" },
  { href: "/fees", label: "Fee setup", perm: "fees", key: "f" },
  { href: "/reports", label: "Reports", perm: "reports", key: "r" },
  { href: "/notifications", label: "Messages", perm: "notifications", key: "m" },
  { href: "/settings", label: "Settings", perm: "settings" },
  { href: "/audit", label: "Audit log", perm: "audit" },
];

async function switchYear(fd: FormData) {
  "use server";
  if (!(await getUser())) redirect("/login");
  const id = Number(fd.get("yearId"));
  if (Number.isInteger(id) && id > 0) (await cookies()).set(YEAR_COOKIE, String(id), { httpOnly: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

async function logout() {
  "use server";
  const jar = await cookies();
  await accounts.logout(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const nav = NAV.filter((n) => can(user.role, n.perm)).map(({ perm: _p, ...n }) => n);
  const wy = await getWorkingYear();
  return (
    <Shell nav={nav} user={{ fullName: user.fullName, role: user.role }} school={settings.name} logout={logout}
      year={{ id: wy.year.id, name: wy.year.name, isCurrent: wy.isCurrent, currentName: wy.current.name, options: wy.years.map((y) => ({ id: y.id, name: y.name, isCurrent: y.isCurrent })) }}
      switchYear={switchYear}>
      {children}
    </Shell>
  );
}
