import { ops } from "@sb/core";

export const dynamic = "force-dynamic";

/** Liveness for NSSM / monitoring. No sensitive detail without login. */
export async function GET() {
  const h = await ops.health();
  return Response.json({ ok: h.dbOk, db: h.dbOk ? "up" : "down" }, { status: h.dbOk ? 200 : 503 });
}
