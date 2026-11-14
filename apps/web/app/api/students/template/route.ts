import { students } from "@sb/core";
import { apiUser } from "@/lib/auth";

export async function GET() {
  const u = await apiUser("studentsEdit");
  if (u instanceof Response) return u;
  const buf = await students.importTemplate();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student-import-template.xlsx"',
    },
  });
}
