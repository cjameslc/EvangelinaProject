import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGuestBooking } from "@/lib/bookingService";
import { quotePrice } from "@/lib/bookingEngine/pricingService";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

const VALID_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { unitId, date, checkOutDate, stayType, name, email, phone, pax, specialRequest } = body;
  if (!unitId || !date || !stayType || !VALID_STAY_TYPES.includes(stayType)) {
    return NextResponse.json({ error: "Missing unit, date, or stay type." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (typeof phone !== "string" || phone.trim().length < 7) return NextResponse.json({ error: "Enter a valid contact number." }, { status: 400 });

  const unit = await prisma.unit.findUnique({ where: { id: unitId, active: true }, select: { id: true, nightlyRate: true } });
  if (!unit) return NextResponse.json({ error: "That unit isn't available." }, { status: 404 });

  // Price is always computed server-side from the real Booking Engine quote
  // — never trust a client-supplied amount for what a guest pays.
  const quote = quotePrice(unit, stayType, new Date(date), checkOutDate ? new Date(checkOutDate) : null);

  const guest = await findOrCreateGuestByEmail(email, name.trim());

  const result = await createGuestBooking(guest.id, {
    unitId,
    date,
    checkOutDate: checkOutDate || null,
    stayType,
    guests: [name.trim()],
    pax: pax ? Number(pax) : null,
    contactNumber: phone.trim(),
    platform: "Direct",
    amount: quote.total,
    paid: false,
    specialRequest: specialRequest || null,
  } as any);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true, booking: result.booking, quote }, { status: 201 });
}
