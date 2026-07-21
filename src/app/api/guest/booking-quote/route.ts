import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAvailabilityForUnits } from "@/lib/bookingEngine/availabilityService";
import { quotePrice } from "@/lib/bookingEngine/pricingService";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

const VALID_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full"];

// Public — no guest session required to browse availability/pricing,
// same as any Airbnb-style search page before you've signed in.
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const checkOutDate = req.nextUrl.searchParams.get("checkOutDate");
  const stayType = req.nextUrl.searchParams.get("stayType") as StayType | null;

  if (!date || !stayType || !VALID_STAY_TYPES.includes(stayType)) {
    return NextResponse.json({ error: "date and a valid stayType are required." }, { status: 400 });
  }

  const units = await prisma.unit.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, shortName: true, unitNumber: true, nightlyRate: true, photoUrl: true },
  });

  const availability = await checkAvailabilityForUnits(
    units.map((u) => u.id),
    { date, checkOutDate, stayType }
  );

  const results = units.map((u) => ({
    unitId: u.id,
    shortName: u.shortName,
    unitNumber: u.unitNumber,
    photoUrl: u.photoUrl,
    available: availability[u.id],
    quote: quotePrice({ nightlyRate: u.nightlyRate }, stayType, new Date(date), checkOutDate ? new Date(checkOutDate) : null),
  }));

  return NextResponse.json({ results });
}
