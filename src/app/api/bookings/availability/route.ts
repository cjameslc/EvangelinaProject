import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, unitIdWhere, unitWhere } from "@/lib/session";
import { bookingsConflict } from "@/lib/calendarMirror";

const STAY_TYPE_KEYS = ["Daycation", "Night", "Full"] as const;
const NEARBY_DAYS = 7; // how many days before/after the requested date to search for a free alternative

function parseDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}
function isoOf(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic availability lookup for the Bookings page's "Check
 * availability" chat widget — no AI/NLP involved, just the same
 * bookingsConflict() the booking-creation guard itself enforces, run ahead
 * of time so a Booker can see whether a date/unit/stay-type is free (and if
 * not, what the nearest real alternatives are) before attempting to log it.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const dateIso = searchParams.get("date");
  const unitId = searchParams.get("unitId"); // omitted/"" = check every unit the caller can see
  const stayType = searchParams.get("stayType"); // omitted/"" = check every stay type

  const date = dateIso ? parseDate(dateIso) : null;
  if (!date) return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
  if (stayType && !STAY_TYPE_KEYS.includes(stayType as any)) {
    return NextResponse.json({ error: "stayType must be Daycation, Night, or Full." }, { status: 400 });
  }

  const units = await prisma.unit.findMany({
    where: { ...unitIdWhere(user), ...(unitId ? { id: unitId } : {}) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, unitNumber: true, shortName: true },
  });
  if (units.length === 0) return NextResponse.json({ error: unitId ? "Unit not found." : "No units available." }, { status: 404 });

  // Wide enough window to cover every unit's bookings across the ±NEARBY_DAYS
  // range around the requested date, fetched once and reused for every
  // unit/stayType/day combination checked below.
  const windowStart = addDays(date, -NEARBY_DAYS);
  const windowEnd = addDays(date, NEARBY_DAYS + 2); // +2: a booking starting just before the window can still occupy days inside it
  const bookings = await prisma.booking.findMany({
    where: { ...unitWhere(user), unitId: { in: units.map((u) => u.id) }, date: { gte: windowStart, lt: windowEnd } },
    select: { unitId: true, stayType: true, date: true, checkOutDate: true },
  });
  const bookingsByUnit = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (!bookingsByUnit.has(b.unitId)) bookingsByUnit.set(b.unitId, []);
    bookingsByUnit.get(b.unitId)!.push(b);
  }

  function isFree(uId: string, st: string, d: Date): boolean {
    const existing = bookingsByUnit.get(uId) ?? [];
    return !existing.some((b) => bookingsConflict({ stayType: st, date: d, checkOutDate: null }, b));
  }

  const stayTypesToCheck = stayType ? [stayType] : [...STAY_TYPE_KEYS];
  const unitLabel = (u: (typeof units)[number]) => `Unit ${u.unitNumber} · ${u.shortName}`;

  // The exact combination(s) asked about, on the exact date.
  const requested = units.flatMap((u) =>
    stayTypesToCheck.map((st) => ({
      unitId: u.id,
      unit: unitLabel(u),
      stayType: st,
      date: isoOf(date),
      available: isFree(u.id, st, date),
    }))
  );
  const allRequestedAvailable = requested.every((r) => r.available);

  // Alternatives — only computed when something was unavailable, since a
  // fully-available request has nothing to suggest.
  let sameDayOtherOptions: typeof requested = [];
  let nearbyDates: { date: string; available: boolean }[] = [];

  if (!allRequestedAvailable) {
    // Same day, every unit × every stay type (not just what was asked for) —
    // surfaces "this unit's booked, but Unit X is free" and "Full's taken,
    // but Daycation/Night are open" in one pass.
    // Bug fix: the old exclusion clause was meant to skip re-listing the
    // exact (unit, stay type) combo already shown as unavailable up top, but
    // its `unitId || r.unitId` trick collapsed to "same stay type" whenever
    // no specific unit was requested — silently hiding every OTHER unit
    // that's genuinely free for the same stay type ("any unit" + "Full"
    // would filter out every free Full-stay unit, showing only Daycation/
    // Night alternatives). For a specific-unit request the exact combo is
    // always unavailable here already (or this branch wouldn't run at all),
    // so `r.available` alone already excludes it — no extra clause needed.
    sameDayOtherOptions = units.flatMap((u) =>
      STAY_TYPE_KEYS.map((st) => ({
        unitId: u.id,
        unit: unitLabel(u),
        stayType: st,
        date: isoOf(date),
        available: isFree(u.id, st, date),
      }))
    ).filter((r) => r.available);
    // The result is capped (below) to keep the chat bubble short, so without
    // this the stay type actually asked about can get pushed out entirely by
    // "other stay type, same unit" rows listed first — surface matches on
    // the requested stay type before anything else. Stable sort: unit order
    // within each group is unchanged.
    if (stayType) {
      sameDayOtherOptions.sort((a, b) => (a.stayType === stayType ? 0 : 1) - (b.stayType === stayType ? 0 : 1));
    }

    // Nearby dates for the FIRST requested unit+stayType only (the specific
    // thing that was actually asked about) — only meaningful when a single
    // unit and stay type were both specified.
    if (unitId && stayType) {
      for (let offset = -NEARBY_DAYS; offset <= NEARBY_DAYS; offset++) {
        if (offset === 0) continue;
        const d = addDays(date, offset);
        nearbyDates.push({ date: isoOf(d), available: isFree(unitId, stayType, d) });
      }
      nearbyDates = nearbyDates.filter((n) => n.available).sort((a, b) => Math.abs(+new Date(a.date) - +date.getTime()) - Math.abs(+new Date(b.date) - +date.getTime()));
    }
  }

  return NextResponse.json({
    date: isoOf(date),
    requested,
    allAvailable: allRequestedAvailable,
    alternatives: {
      sameDayOtherOptions: sameDayOtherOptions.slice(0, 8),
      nearbyDates: nearbyDates.slice(0, 5),
    },
  });
}
