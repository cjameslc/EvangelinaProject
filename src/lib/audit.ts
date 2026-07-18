import { prisma } from "@/lib/prisma";

/** Records an audit trail entry. Never throws — audit logging must never break the primary request it's attached to. */
export async function logAudit(actorUserId: string | null, action: string, entity: string, entityId?: string, meta?: unknown) {
  try {
    await prisma.auditLog.create({
      data: { actorUserId: actorUserId ?? undefined, action, entity, entityId, meta: meta as any },
    });
  } catch {
    // audit logging must never break the primary request
  }
}
