import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function BillingPage() {
  await requireRole("billing");
  redirect("/invoices?billrun=1");
}
