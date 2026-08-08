import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canViewAccessHistory } from "@/lib/rbac";

// Reads the credential audit trail out of the existing app-wide AuditLog
// (action "access.credential.*", entity "AccessCredential") — no bespoke
// history table. Scoped by unitId or bookingId; at least one is required
// so this can never become an unscoped dump of every credential event.
export async function GET(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canViewAccessHistory(user.role)) return new Response("Forbidden", { status: 403 });

  const { searchParams } = new URL(req.url);
  const unitId = searchParams.get("unitId");
  const bookingId = searchParams.get("bookingId");
  if (!unitId && !bookingId) return NextResponse.json({ error: "unitId or bookingId is required." }, { status: 400 });

  const credentials = await prisma.accessCredential.findMany({
    where: bookingId ? { bookingId } : { unitId: unitId! },
    select: { id: true, unitId: true },
    orderBy: { createdAt: "desc" },
  });
  if (credentials.length === 0) return NextResponse.json({ events: [] });

  const scopedUnitId = unitId ?? credentials[0].unitId;
  if (!await isUnitInScope(user, scopedUnitId)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const events = await prisma.auditLog.findMany({
    where: { entity: "AccessCredential", entityId: { in: credentials.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, role: true } } },
  });

  return NextResponse.json({ events });
}
