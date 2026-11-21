import { redirect } from "next/navigation";

/** Promotion moved to its own page (side menu → Promotion). */
export default function OldPromotion() {
  redirect("/promotion");
}
