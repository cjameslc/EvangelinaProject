import { NextResponse } from "next/server";
import { prisma, prismaPool } from "@/lib/prisma";
import { requireUser, unitWhere } from "@/lib/session";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";

// Cleaning shouldn't run longer than this — spec section 4's "maximum
// finish" window, checked from startedAt regardless of stay type.
const CLEANING_MAX_MS = 2 * 3600 * 1000;

/** No cron slot is free for a real-time overdue watcher (see
 * docs/Maintenance.md's cron-slot discipline, already followed by the
 * iCal cron's own piggybacking) — this runs opportunistically instead,
 * every time anyone loads the housekeeping page, which in practice is
 * often enough during working hours. overdueNotifiedAt guards against
 * re-notifying on every subsequent load while the same clean is still
 * running. Best-effort: a failure here must never break the page load. */
async function checkOverdueCleanings(unitIds: string[]): Promise<void> {
  if (unitIds.length === 0) return;
  try {
    const cutoff = new Date(Date.now() - CLEANING_MAX_MS);
    const overdue = await prisma.housekeepingUnitState.findMany({
      where: { unitId: { in: unitIds }, status: "cleaning", startedAt: { lt: cutoff }, overdueNotifiedAt: null },
      include: { unit: { select: { shortName: true } } },
    });
    for (const state of overdue) {
      const employeeName = state.byName?.trim() || "A housekeeper";
      await notifyStaff({ type: "cleaning.overdue", unitId: state.unitId, unitName: state.unit.shortName, employeeName });
      await prisma.housekeepingUnitState.update({ where: { id: state.id }, data: { overdueNotifiedAt: new Date() } }).catch(() => {});
    }
  } catch {
    // best-effort — never break the page load over this
  }
}

export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const [states, logs] = await Promise.all([
    // No `include: { unit: ... }` here — HkState (HousekeepingView.tsx)
    // doesn't read a `unit` field at all, so the previous `include: { unit:
    // true }` was fetching and serializing every field on Unit (including
    // wifiPassword, doorCode, and the base64 photoUrl) on every load of
    // this page, for data the client never used.
    prismaPool[0].housekeepingUnitState.findMany({ where: unitWhere(user) }),
    prismaPool[1].cleaningLog.findMany({
      where: unitWhere(user),
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { unit: { select: { name: true, shortName: true } }, employee: { select: { name: true } } },
    }),
  ]);

  await checkOverdueCleanings(states.filter((s) => s.status === "cleaning").map((s) => s.unitId));

  return NextResponse.json({ states, logs });
}
