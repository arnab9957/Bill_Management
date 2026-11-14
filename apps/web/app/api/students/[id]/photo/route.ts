import { students } from "@sb/core";
import { apiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Student photo for logged-in staff only (children's data). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser("students");
  if (u instanceof Response) return u;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Bad id", { status: 400 });
  const photo = await students.readStudentPhoto(id);
  if (!photo) return new Response("No photo", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      // File name changes on every upload (?v=…), so a private cache is safe.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
