import { revalidatePath } from "next/cache";
import { students } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { ImportPreview } from "./preview";

async function preview(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  await requireRole("studentsEdit");
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, message: "Choose an .xlsx file" };
  return run(async () => {
    const r = await students.previewImport(await f.arrayBuffer());
    return { ...r, rows: r.rows.slice(0, 2000) };
  }, (r) => `${r.valid} valid row(s), ${r.invalid} with errors`);
}

async function commit(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const user = await requireRole("studentsEdit");
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, message: "Choose the same file again to import" };
  const r = await run(async () => students.commitImport(user, await f.arrayBuffer()), (r) => `Imported ${r.count} student(s)`);
  revalidatePath("/students");
  return r;
}

export default async function ImportPage() {
  await requireRole("studentsEdit");
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Import students from Excel" actions={<>
        <LinkButton href="/api/students/template">Download template</LinkButton>
        <LinkButton href="/students">Back</LinkButton>
      </>} />
      <Notice>Step 1: check the file — nothing is saved. Step 2: import. The import is all-or-nothing: if any row has an error, nothing is saved. Siblings are linked automatically by the guardian mobile number. An Opening Balance creates an opening bill for old dues.</Notice>
      <Card title="1. Check file">
        <ActionForm action={preview}>
          <div className="flex gap-2"><input type="file" name="file" accept=".xlsx" required /><Submit>Check</Submit></div>
          <ImportPreview />
        </ActionForm>
      </Card>
      <Card title="2. Import">
        <ActionForm action={commit}>
          <div className="flex gap-2"><input type="file" name="file" accept=".xlsx" required /><Submit confirm="Import all rows now?">Import</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
