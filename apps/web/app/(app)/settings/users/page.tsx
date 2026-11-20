import { revalidatePath } from "next/cache";
import { accounts } from "@sb/core";
import { roles } from "@sb/validation";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, FieldError, Submit } from "@/components/action-form";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";

async function create(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  const r = await run(() => accounts.createUser(u, formObject(fd)), "User created — they must change the password at first login");
  revalidatePath("/settings/users");
  return r;
}
async function toggle(id: number, active: boolean) {
  "use server";
  const u = await requireRole("settings");
  await accounts.setUserActive(u, id, active);
  revalidatePath("/settings/users");
}
async function reset(id: number, _: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("settings");
  return run(() => accounts.resetUserPassword(u, id, String(fd.get("password"))), "Password reset and account unlocked");
}

const ROLE_HELP = { ADMIN: "Everything", ACCOUNTANT: "Fee setup, billing, cancellations, refunds, reports", CASHIER: "Collect and print only", PRINCIPAL: "Read-only dashboards and reports" };

export default async function Users() {
  const me = await requireRole("settings");
  const list = await accounts.listUsers();
  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle="One login per staff member — never share accounts." actions={<LinkButton href="/settings">Back</LinkButton>} />
      <Card>
        <table className="data">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Reset password</th><th /></tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.id}>
              <td>{u.username}</td><td>{u.fullName}</td><td title={ROLE_HELP[u.role]}>{u.role}</td>
              <td><Badge>{u.isActive ? "active" : "cancelled"}</Badge>{u.lockedUntil && u.lockedUntil > new Date() && <span className="ml-1 text-xs text-red-600">locked</span>}</td>
              <td><ActionForm action={reset.bind(null, u.id)} className="flex gap-1"><input name="password" type="password" placeholder="New password" className="w-36" minLength={8} required /><Submit variant="secondary">Reset</Submit><FieldError name="_" /></ActionForm></td>
              <td>{u.id !== me.id && <form action={toggle.bind(null, u.id, !u.isActive)}><button className="text-xs text-ink hover:underline">{u.isActive ? "Deactivate" : "Activate"}</button></form>}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="Add user">
        <ActionForm action={create} className="grid gap-3 sm:grid-cols-4" resetOnSuccess>
          <label className="flex flex-col gap-1">Username<input name="username" required /><FieldError name="username" /></label>
          <label className="flex flex-col gap-1">Full name<input name="fullName" required /></label>
          <label className="flex flex-col gap-1">Role<select name="role">{roles.map((r) => <option key={r} value={r}>{r} — {ROLE_HELP[r]}</option>)}</select></label>
          <label className="flex flex-col gap-1">Temporary password<input name="password" type="password" minLength={8} required /><FieldError name="password" /></label>
          <div><Submit>Create user</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
