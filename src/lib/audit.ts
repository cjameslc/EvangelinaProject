import { prisma } from "@/lib/prisma";

const MAX_META_STRING_LENGTH = 2000;

/**
 * Strips/truncates any oversized string in an audit meta payload before
 * it's written. Most callers pass `{ ...body }` from a route's own request
 * body — safe for a normal edit, but a real, repeated problem whenever
 * that body happens to include a data-URL image (a unit.update entry once
 * reached 3.5MB this way, from a base64 photo caught in the spread, back
 * when unit/booking photo uploads still sent base64 instead of a Blob
 * URL). logAudit is the one place every caller passes through, so
 * sanitizing here protects every current and future call site instead of
 * trusting each one to remember not to pass a raw upload body.
 */
function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[too deep]";
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[stripped data-URL, ${value.length} chars]`;
    if (value.length > MAX_META_STRING_LENGTH) return `${value.slice(0, MAX_META_STRING_LENGTH)}…[truncated, ${value.length} chars total]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeMeta(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeMeta(v, depth + 1);
    return out;
  }
  return value;
}

/** Records an audit trail entry. Never throws — audit logging must never break the primary request it's attached to. */
export async function logAudit(actorUserId: string | null, action: string, entity: string, entityId?: string, meta?: unknown) {
  try {
    await prisma.auditLog.create({
      data: { actorUserId: actorUserId ?? undefined, action, entity, entityId, meta: sanitizeMeta(meta) as any },
    });
  } catch {
    // audit logging must never break the primary request
  }
}
