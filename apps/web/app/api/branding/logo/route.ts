import { readSchoolLogo } from "@sb/core";
import { apiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The school's logo, for signed-in staff only (it is printed on receipts and bills). */
export async function GET() {
  const u = await apiUser("students");
  if (u instanceof Response) return u;
  const logo = await readSchoolLogo();
  if (!logo) return new Response("No logo", { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
