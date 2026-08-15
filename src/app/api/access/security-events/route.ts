import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitIdWhere } from "@/lib/session";
import { canViewAccessHistory } from "@/lib/rbac";

/**
 * Security Monitor's event list — TTLock access history this app has
 * already classified (see src/lib/access/eventSync.ts), scoped to units
 * this owner/tenant actually owns (same unitIdWhere every other
 * unit-scoped list query in this app uses — a security log is exactly
 * the kind of thing that must never leak across tenants). Same RBAC gate
 * as the existing per-credential access history endpoint —
 * canViewAccessHistory (Owner/Admin, Co-owner, Auditor) — reused rather
 * than inventing a parallel permission.
 */
export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canViewAccessHistory(user.role)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const includeDismissed = searchParams.get("includeDismissed") === "true";
  const unitId = searchParams.get("unitId");

  const scopedUnits = await prisma.unit.findMany({ where: unitIdWhere(user), select: { id: true } });
  const scopedUnitIds = scopedUnits.map((u) => u.id);
  if (unitId && !scopedUnitIds.includes(unitId)) return NextResponse.json({ events: [] });

  const events = await prisma.accessEvent.findMany({
    where: {
      unitId: unitId ? unitId : { in: scopedUnitIds },
      ...(includeDismissed ? {} : { dismissedAt: null }),
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });

  const units = await prisma.unit.findMany({ where: { id: { in: scopedUnitIds } }, select: { id: true, shortName: true, unitNumber: true } });
  const unitLabel = Object.fromEntries(units.map((u) => [u.id, u.shortName || u.unitNumber]));

  const summary = {
    total: events.length,
    critical: events.filter((e) => e.severity === "CRITICAL").length,
    high: events.filter((e) => e.severity === "HIGH").length,
    medium: events.filter((e) => e.severity === "MEDIUM").length,
  };

  return NextResponse.json({
    events: events.map((e) => ({ ...e, unitLabel: e.unitId ? unitLabel[e.unitId] ?? e.unitId : null })),
    summary,
  });
}
