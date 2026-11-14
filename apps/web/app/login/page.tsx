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
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{s.name}</h1>
        <p className="mb-5 text-sm text-gray-500">Fee billing — sign in</p>
        <ActionForm action={loginAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">Username<input name="username" autoFocus autoComplete="username" required /></label>
          <label className="flex flex-col gap-1">Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <Submit>Sign in</Submit>
        </ActionForm>
      </div>
    </main>
  );
}
