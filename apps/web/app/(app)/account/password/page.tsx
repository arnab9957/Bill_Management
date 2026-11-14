import { redirect } from "next/navigation";
import { accounts } from "@sb/core";
import { getUser } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";

async function change(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await getUser();
  if (!user) redirect("/login");
  const r = await run(() => accounts.changePassword(user, Object.fromEntries(fd)), "Password changed");
  if (r?.ok) redirect("/");
  return r;
}

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  return (
    <div className="max-w-md">
      <PageHeader title="Change password" />
      {first && <div className="mb-4"><Notice tone="warn">Please set your own password before continuing.</Notice></div>}
      <Card>
        <ActionForm action={change} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">Current password<input type="password" name="current" required /><FieldError name="current" /></label>
          <label className="flex flex-col gap-1">New password (min 8)<input type="password" name="next" required minLength={8} /><FieldError name="next" /></label>
          <label className="flex flex-col gap-1">Confirm new password<input type="password" name="confirm" required /><FieldError name="confirm" /></label>
          <Submit>Change password</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
