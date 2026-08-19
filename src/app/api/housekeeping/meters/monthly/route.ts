import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitIdWhere } from "@/lib/session";
import { manilaMonthStart } from "@/lib/format";

type MeterTotal = { consumption: number; readingCount: number; anomalyCount: number };

function emptyTotal(): MeterTotal {
  return { consumption: 0, readingCount: 0, anomalyCount: 0 };
}

async function totalsForMonth(unitIds: string[], monthStart: Date) {
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const readings = await prisma.meterReading.findMany({
    where: { unitId: { in: unitIds }, createdAt: { gte: monthStart, lt: monthEnd } },
    select: { unitId: true, meterType: true, consumption: true, anomalyDetected: true },
  });

  const byUnit = new Map<string, { WATER: MeterTotal; ELECTRICITY: MeterTotal }>();
  for (const id of unitIds) byUnit.set(id, { WATER: emptyTotal(), ELECTRICITY: emptyTotal() });

  for (const r of readings) {
    if (r.meterType !== "WATER" && r.meterType !== "ELECTRICITY") continue;
    const bucket = byUnit.get(r.unitId)?.[r.meterType];
    if (!bucket) continue;
    if (r.consumption !== null) bucket.consumption += r.consumption;
    bucket.readingCount += 1;
    if (r.anomalyDetected) bucket.anomalyCount += 1;
  }
  return byUnit;
}

// Monthly consumption metrics for the Meter Reading panel's "Monthly
// metrics" view — sums each reading's already-computed `consumption` delta
// (spec STEP 10, calculated server-side at capture time, never re-derived
// or trusted from the client) grouped by unit + meter type, for the
// requested month and the month before it (so the UI can show a plain %
// delta without a second round trip).
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const monthParam = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const requested = monthParam ? new Date(`${monthParam}-01T00:00:00Z`) : new Date();
  if (Number.isNaN(requested.getTime())) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }
  const monthStart = manilaMonthStart(requested);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setUTCMonth(prevMonthStart.getUTCMonth() - 1);

  const units = await prisma.unit.findMany({
    where: unitIdWhere(user),
    orderBy: { sortOrder: "asc" },
    select: { id: true, shortName: true, unitNumber: true },
  });
  const unitIds = units.map((u) => u.id);

  const [current, previous] = await Promise.all([
    totalsForMonth(unitIds, monthStart),
    totalsForMonth(unitIds, prevMonthStart),
  ]);

  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    units: units.map((u) => ({
      unitId: u.id,
      shortName: u.shortName,
      unitNumber: u.unitNumber,
      water: current.get(u.id)!.WATER,
      electricity: current.get(u.id)!.ELECTRICITY,
      previousWater: previous.get(u.id)!.WATER,
      previousElectricity: previous.get(u.id)!.ELECTRICITY,
    })),
  });
}
