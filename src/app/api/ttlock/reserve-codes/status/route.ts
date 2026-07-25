import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Owner Dashboard "Emergency Access Codes" monitoring data — aggregate
// counts per unit plus the singleton TtlockStatus row (updated by every
// real API call the retry wrapper makes, success or failure).
export async function GET() {
  const { error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const [codes, status, units] = await Promise.all([
    prisma.reserveAccessCode.groupBy({ by: ["unitId", "status"], _count: true }),
    prisma.ttlockStatus.findUnique({ where: { id: 1 } }),
    prisma.unit.findMany({ select: { id: true, shortName: true } }),
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
