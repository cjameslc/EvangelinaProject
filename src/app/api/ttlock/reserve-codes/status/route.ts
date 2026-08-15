import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Owner Dashboard "Emergency Access Codes" monitoring data — aggregate
// counts per unit plus the singleton TtlockStatus row (updated by every
// real API call the retry wrapper makes, success or failure).
export async function GET() {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  // codes/units were unscoped — any Owner/Admin saw every tenant's unit
  // names and reserve-code inventory counts. ttlockStatus (id: 1) stays
  // global/unscoped on purpose — it's a real singleton reflecting the one
  // shared TTLock account's own last-success/failure, not per-tenant data.
  const [codes, status, units] = await Promise.all([
    prisma.reserveAccessCode.groupBy({ by: ["unitId", "status"], _count: true, where: { unit: { ownerId: user.ownerId } } }),
    prisma.ttlockStatus.findUnique({ where: { id: 1 } }),
    prisma.unit.findMany({ where: { ownerId: user.ownerId }, select: { id: true, shortName: true } }),
  ]);

  const byUnit = units.map((u) => {
    const rows = codes.filter((c) => c.unitId === u.id);
    const total = rows.reduce((sum, r) => sum + r._count, 0);
    const available = rows.find((r) => r.status === "AVAILABLE")?._count ?? 0;
    const inUse = total - available;
    return { unitId: u.id, unitName: u.shortName, total, available, inUse };
  });

  return NextResponse.json({
    byUnit,
    totals: {
      total: byUnit.reduce((s, u) => s + u.total, 0),
      available: byUnit.reduce((s, u) => s + u.available, 0),
      inUse: byUnit.reduce((s, u) => s + u.inUse, 0),
    },
    ttlockStatus: status
      ? { lastSuccessAt: status.lastSuccessAt, lastFailureAt: status.lastFailureAt, lastFailureMessage: status.lastFailureMessage }
      : { lastSuccessAt: null, lastFailureAt: null, lastFailureMessage: null },
  });
}
