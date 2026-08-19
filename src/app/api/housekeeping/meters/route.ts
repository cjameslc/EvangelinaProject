import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitWhere, unitIdWhere } from "@/lib/session";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";
import { manilaDayStart, meterReadingTargetDay } from "@/lib/format";

/** Same "no free cron slot" discipline as checkOverdueCleanings in the
 * sibling /api/housekeeping route — runs opportunistically on page load
 * instead of a real-time watcher. Deliberately checks YESTERDAY, not
 * today: today's target still has hours left to complete (surfaced
 * instead as a live banner in HousekeepingView, computed client-side from
 * the same meterReadingTargetDay helper), so there's no single defensible
 * "it's late enough now" cutoff within the day itself — but yesterday is
 * unambiguously over, so "was it logged, yes or no" has one right answer.
 * Dedup has no dedicated schema column (unlike overdueNotifiedAt) — there's
 * no natural per-unit-per-meterType-per-day row to hang one off, so this
 * checks for an existing same-day StaffNotification whose message contains
 * the meter type's own label instead (see staffMessage's comment on why
 * that word is load-bearing). Best-effort: a failure here must never break
 * the page load. */
async function checkMissedMeterReadingTargets(units: { id: string; shortName: string }[]): Promise<void> {
  if (units.length === 0) return;
  try {
    const todayStart = manilaDayStart();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const target = meterReadingTargetDay(yesterdayStart);
    if (!target.isTarget) return;

    const unitIds = units.map((u) => u.id);
    const [logged, alreadyNotified] = await Promise.all([
      prisma.meterReading.findMany({
        where: { unitId: { in: unitIds }, meterType: { in: ["WATER", "ELECTRICITY"] }, createdAt: { gte: yesterdayStart, lt: todayStart } },
        select: { unitId: true, meterType: true },
      }),
      prisma.staffNotification.findMany({
        where: { type: "meterReading.missed", unitId: { in: unitIds }, createdAt: { gte: todayStart } },
        select: { unitId: true, message: true },
      }),
    ]);
    const loggedSet = new Set(logged.map((r) => `${r.unitId}::${r.meterType}`));
    const notifiedSet = new Set(
      alreadyNotified.flatMap((n) => {
        const types: ("WATER" | "ELECTRICITY")[] = [];
        if (n.message.includes("Water")) types.push("WATER");
        if (n.message.includes("Electricity")) types.push("ELECTRICITY");
        return types.map((t) => `${n.unitId}::${t}`);
      }),
    );

    for (const unit of units) {
      for (const meterType of ["WATER", "ELECTRICITY"] as const) {
        const key = `${unit.id}::${meterType}`;
        if (loggedSet.has(key) || notifiedSet.has(key)) continue;
        await notifyStaff({ type: "meterReading.missed", unitId: unit.id, unitName: unit.shortName, meterType, targetLabel: target.label! });
      }
    }
  } catch {
    // best-effort — never break the page load over this
  }
}

// Every reading for the caller's in-scope units, most recent first — the
// panel derives "latest per unit+type" and history client-side from this
// one list rather than needing a second endpoint.
export async function GET() {
  const { user, error } = await requireUser();
  if (error) return error;

  const [readings, units] = await Promise.all([
    prisma.meterReading.findMany({ where: unitWhere(user), orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.unit.findMany({ where: unitIdWhere(user), select: { id: true, shortName: true } }),
  ]);

  await checkMissedMeterReadingTargets(units);

  return NextResponse.json(readings);
}
