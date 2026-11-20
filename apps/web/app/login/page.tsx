import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { accounts, getSettings } from "@sb/core";
import { run, type ActionState } from "@/lib/action";
import { SESSION_COOKIE, getUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/action-form";

export const dynamic = "force-dynamic";

async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const ip = (await headers()).get("x-forwarded-for") ?? undefined;
  const res = await run(() => accounts.login({ username: fd.get("username"), password: fd.get("password") }, ip));
  if (!res?.ok) return res;
  const { token, user } = res.data as Awaited<ReturnType<typeof accounts.login>>;
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", path: "/", secure: false });
  redirect(user.mustChangePassword ? "/account/password?first=1" : user.role === "CASHIER" ? "/collect" : "/");
}

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  const s = await getSettings();
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-5 sm:p-8">
      <div className="w-full max-w-[420px] rounded-xl border border-gray-200 bg-surface p-8 shadow-sm sm:p-10">
        <div className="mb-8">
          <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-semibold text-white shadow-sm">₹</div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Fee Management</div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">{s.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">Sign in to manage accounts and collections.</p>
        </div>
        <ActionForm action={loginAction} className="flex flex-col gap-5">
          <label className="flex flex-col gap-2">Username<input name="username" autoFocus autoComplete="username" required /></label>
          <label className="flex flex-col gap-2">Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <div className="mt-1"><Submit className="w-full">Sign in</Submit></div>
        </ActionForm>
      </div>
    </main>
  );
}
