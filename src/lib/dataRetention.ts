import { prisma } from "@/lib/prisma";

// Retention windows are a real business decision, not a technical default —
// these specific numbers were chosen deliberately per table (staff
// notifications are short-lived operational alerts; guest notifications are
// guest-visible history and kept longer; the audit log and access/security
// events are kept longest since they exist for accountability/investigation).
// Financial and booking records are NEVER pruned by this — this only ever
// touches operational log/notification tables that were previously growing
// forever with zero cleanup mechanism (confirmed live: a 105-row stale
// StaffNotification backlog had accumulated with nothing ever clearing it).
const RETENTION_DAYS = {
  staffNotifications: 30,
  guestNotifications: 90,
  auditLog: 365,
  accessEvents: 182, // 6 months
} as const;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

export type RetentionResult = {
  staffNotifications: number;
  guestNotifications: number;
  auditLog: number;
  accessEvents: number;
};

/**
 * Piggybacked onto the existing daily /api/ical/cron run — see that
 * route's own comment on why: the Vercel Hobby plan allows exactly one
 * cron slot, already shared by 4 other jobs, so this is a 5th rather than
 * a new one. Each table is independent and best-effort from the caller's
 * perspective (see that route's .catch() wrapping) — a failure pruning one
 * table must never block another, so each delete is individually guarded
 * here too rather than relying on the caller alone.
 */
export async function pruneStaleData(): Promise<RetentionResult> {
  const [staffNotifications, guestNotifications, auditLog, accessEvents] = await Promise.all([
    prisma.staffNotification.deleteMany({ where: { createdAt: { lt: daysAgo(RETENTION_DAYS.staffNotifications) } } }).catch(() => ({ count: 0 })),
    prisma.guestNotification.deleteMany({ where: { createdAt: { lt: daysAgo(RETENTION_DAYS.guestNotifications) } } }).catch(() => ({ count: 0 })),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(RETENTION_DAYS.auditLog) } } }).catch(() => ({ count: 0 })),
    // occurredAt (when the real lock event happened), not createdAt (when
    // this row was written) — the two are normally close together, but
    // occurredAt is the more honest "age" for a security event.
    prisma.accessEvent.deleteMany({ where: { occurredAt: { lt: daysAgo(RETENTION_DAYS.accessEvents) } } }).catch(() => ({ count: 0 })),
  ]);
  return {
    staffNotifications: staffNotifications.count,
    guestNotifications: guestNotifications.count,
    auditLog: auditLog.count,
    accessEvents: accessEvents.count,
  };
}
