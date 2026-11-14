import type { NextRequest } from "next/server";
import { payments, reports, students, today } from "@sb/core";
import { rupeesToPaise } from "@sb/validation";
import { apiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const xlsx = (buf: Buffer, name: string) =>
  new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}-${today()}.xlsx"`,
    },
  });

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? `${today().slice(0, 7)}-01`;
  const to = sp.get("to") ?? today();

  if (report === "students") {
    const u = await apiUser("students"); if (u instanceof Response) return u;
    const rows = await students.searchStudents(sp.get("q") ?? "", { classId: sp.get("classId") ? Number(sp.get("classId")) : undefined, status: sp.get("status") ?? "active", limit: 100000 });
    return xlsx(await reports.toXlsx("Students", [
      { header: "Admission No", key: "admissionNo" }, { header: "Name", key: "name", width: 28 }, { header: "Class", key: "className" },
      { header: "Section", key: "sectionName" }, { header: "Roll", key: "rollNo" }, { header: "Status", key: "status" }, { header: "Outstanding", key: "outstanding", money: true },
    ], rows), "students");
  }

  const u = await apiUser("reports"); if (u instanceof Response) return u;
  switch (report) {
    case "defaulters": {
      const rows = await reports.defaulters({ classId: sp.get("classId") ? Number(sp.get("classId")) : undefined, minAmount: sp.get("min") ? rupeesToPaise.safeParse(sp.get("min")).data ?? 0 : 0, minDaysOverdue: Number(sp.get("days") || 1) });
      return xlsx(await reports.toXlsx("Defaulters", [
        { header: "Admission No", key: "admissionNo" }, { header: "Name", key: "name", width: 28 }, { header: "Class", key: "className" }, { header: "Guardian", key: "guardian", width: 30 },
        { header: "Oldest due", key: "oldestDue" }, { header: "Days overdue", key: "daysOverdue" }, { header: "Bills", key: "invoices" }, { header: "Amount", key: "due", money: true },
      ], rows), "defaulters");
    }
    case "collections":
    case "daybook": {
      const f = report === "daybook" ? { from: sp.get("date") ?? today(), to: sp.get("date") ?? today() } : { from, to };
      const rows = (await payments.listPayments(f)).map((r) => ({ ...r.p, studentName: r.studentName, admissionNo: r.admissionNo, className: r.className, cashier: r.cashier }));
      return xlsx(await reports.toXlsx("Receipts", [
        { header: "Receipt", key: "receiptNo", width: 22 }, { header: "Date", key: "date" }, { header: "Admission No", key: "admissionNo" }, { header: "Student", key: "studentName", width: 26 },
        { header: "Class", key: "className" }, { header: "Mode", key: "mode" }, { header: "Reference", key: "referenceNo" }, { header: "Cashier", key: "cashier" },
        { header: "Status", key: "status" }, { header: "Amount", key: "amount", money: true },
      ], rows), report);
    }
    case "outstanding": {
      const rows = await reports.outstandingByClass();
      return xlsx(await reports.toXlsx("Outstanding", [
        { header: "Class", key: "className" }, { header: "Billed", key: "billed", money: true }, { header: "Paid", key: "paid", money: true },
        { header: "Balance", key: "balance", money: true }, { header: "Overdue", key: "overdue", money: true },
      ], rows), "outstanding");
    }
    case "tally": {
      const csv = await reports.tallyReceiptsCsv(from, to);
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="tally-receipts-${from}-to-${to}.csv"` } });
    }
  }
  return new Response("Unknown report", { status: 404 });
}
