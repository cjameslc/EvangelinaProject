import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailabilityForUnits } from "@/lib/bookingEngine/availabilityService";
import { quotePrice } from "@/lib/bookingEngine/pricingService";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { normalizeGuestCheckOutDate } from "@/lib/bookingEngine/guestCheckout";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

const VALID_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full"];

// Public — no guest session required to browse availability/pricing,
// same as any Airbnb-style search page before you've signed in.
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const checkOutDate = req.nextUrl.searchParams.get("checkOutDate");
  const stayType = req.nextUrl.searchParams.get("stayType") as StayType | null;

  if (!date || Number.isNaN(new Date(date).getTime()) || !stayType || !VALID_STAY_TYPES.includes(stayType)) {
    return NextResponse.json({ error: "date and a valid stayType are required." }, { status: 400 });
  }
  if (checkOutDate && Number.isNaN(new Date(checkOutDate).getTime())) {
    return NextResponse.json({ error: "Invalid check-out date." }, { status: 400 });
  }

  const [units, settings] = await Promise.all([
    prisma.unit.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, shortName: true, unitNumber: true, photoUrl: true },
    }),
    getCachedBookingSettings(),
  ]);

  // Never trust a client-supplied checkOutDate for a Night stay — always
  // exactly one night. Full stay may span more; Daycation never has one.
  const normalizedCheckOutDate = normalizeGuestCheckOutDate(stayType, new Date(date), checkOutDate ? new Date(checkOutDate) : null);
  const normalizedCheckOutDateStr = normalizedCheckOutDate ? normalizedCheckOutDate.toISOString().slice(0, 10) : null;

  const availability = await checkAvailabilityForUnits(
    units.map((u) => u.id),
    { date, checkOutDate: normalizedCheckOutDateStr, stayType }
  );

  // Same rate table for every unit — see pricingService.ts.
  const quote = quotePrice(stayType, new Date(date), normalizedCheckOutDate, settings, settings.dpFee);

  const results = units.map((u) => ({
    unitId: u.id,
    shortName: u.shortName,
    unitNumber: u.unitNumber,
    photoUrl: u.photoUrl,
    available: availability[u.id],
    quote,
  }));

  return NextResponse.json({ results });
}
