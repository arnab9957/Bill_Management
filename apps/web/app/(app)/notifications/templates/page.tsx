import { revalidatePath } from "next/cache";
import { notifications } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { formObject, run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, PageHeader } from "@/components/ui";

async function save(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const u = await requireRole("notifications");
  const r = await run(() => notifications.saveTemplate(u, formObject(fd)), "Template saved");
  revalidatePath("/notifications/templates");
  return r;
}
async function addHindi(id: number) {
  "use server";
  const u = await requireRole("notifications");
  await notifications.addTemplateLanguage(u, id, "hi");
  revalidatePath("/notifications/templates");
}

export default async function Templates() {
  await requireRole("notifications");
  const list = await notifications.listTemplates();
  return (
    <div className="space-y-4">
      <PageHeader title="Message templates" subtitle={<>Placeholders: {notifications.PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}</>} actions={<LinkButton href="/notifications">Back</LinkButton>} />
      <p className="text-sm text-gray-600">WhatsApp and SMS text must match the template approved by Meta / DLT exactly. Put the approved template name / DLT template ID in “Provider template ID”.</p>
      {list.map((t) => (
        <Card key={t.id} title={<>{t.event.replace(/_/g, " ")} · <span className="capitalize">{t.channel}</span> · {t.language.toUpperCase()}</>}
          actions={t.language === "en" && !list.some((x) => x.event === t.event && x.channel === t.channel && x.language === "hi") ? <form action={addHindi.bind(null, t.id)}><button className="text-xs text-ink hover:underline">+ Hindi version</button></form> : null}>
          <ActionForm action={save} className="grid gap-3 lg:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <div className="flex flex-col gap-2">
              {t.channel === "email" && <input name="subject" defaultValue={t.subject ?? ""} placeholder="Subject" />}
              <textarea name="body" defaultValue={t.body} rows={t.channel === "sms" ? 3 : 6} />
              <div className="flex flex-wrap items-center gap-3">
                <input name="providerTemplateId" defaultValue={t.providerTemplateId ?? ""} placeholder="Provider template ID" className="w-56" />
                <label className="flex items-center gap-1"><input type="checkbox" name="isActive" defaultChecked={t.isActive} />Active</label>
                <Submit variant="secondary">Save</Submit>
              </div>
            </div>
            <div className="rounded-md bg-gray-50 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Preview (sample data)</div>
              {t.subject && <div className="font-medium">{notifications.renderTemplate(t.subject, notifications.SAMPLE_VARS)}</div>}
              <div className="whitespace-pre-line">{notifications.renderTemplate(t.body, notifications.SAMPLE_VARS)}</div>
              {t.channel === "sms" && <div className="mt-1 text-xs text-gray-500">{notifications.renderTemplate(t.body, notifications.SAMPLE_VARS).length} characters</div>}
            </div>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
