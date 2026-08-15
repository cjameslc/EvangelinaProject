import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function GET() {
  const { user, error } = await requireUser(["OWNER_ADMIN", "AUDITOR"]);
  if (error) return error;
  // Was missing entirely — the most severe gap in this sweep: every
  // tenant's complete audit trail (logins, financial changes, everything)
  // was visible to every Admin/Auditor on the platform. Scoped via the
  // actor's own ownerId — a system-generated entry with no actorUserId
  // (e.g. an automatic guest-booking access-credential event) has no
  // relation to filter through and is excluded here rather than risk
  // showing it to the wrong tenant; giving AuditLog its own ownerId to
  // cover those too is a real, separate follow-up, not silently dropped.
  const logs = await prisma.auditLog.findMany({
    where: { actor: { ownerId: user.ownerId } },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { actor: { select: { name: true, role: true } } },
  });
  return NextResponse.json(logs);
}
