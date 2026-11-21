"use server";

import { revalidatePath } from "next/cache";
import { billing } from "@sb/core";
import { requireRole } from "@/lib/auth";
import { run, type ActionState } from "@/lib/action";

export async function runBilling(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("billing");
  const commit = fd.get("intent") === "commit";
  const classIds = fd.getAll("classIds").map(Number).filter(Boolean);
  const r = await run(
    () => billing.generateInvoices({ period: String(fd.get("period")), classIds, dryRun: !commit }, user),
    (x) => commit ? `Created ${x.created.length} bill(s). ${x.skipped.length} skipped.` : `Preview: ${x.planned.length} bill(s) would be created.`
  );
  if (commit) {
    revalidatePath("/invoices");
    revalidatePath("/billing");
  }
  return r;
}
