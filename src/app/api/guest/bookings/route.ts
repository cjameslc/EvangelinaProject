import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGuestBooking } from "@/lib/bookingService";
import { bookingSchema } from "@/lib/validation";
import { quotePrice } from "@/lib/bookingEngine/pricingService";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { sendBookingConfirmationEmail } from "@/lib/email";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

const VALID_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full"];

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { unitId, date, checkOutDate, stayType, name, email, phone, pax, specialRequest, paymentType } = body;
  if (typeof unitId !== "string" || !unitId || !isValidDateString(date) || !stayType || !VALID_STAY_TYPES.includes(stayType)) {
    return NextResponse.json({ error: "Missing or invalid unit, date, or stay type." }, { status: 400 });
  }
  if (paymentType !== undefined && paymentType !== "full" && paymentType !== "down_payment") {
    return NextResponse.json({ error: "Invalid payment type." }, { status: 400 });
  }
  if (checkOutDate !== undefined && checkOutDate !== null && !isValidDateString(checkOutDate)) {
    return NextResponse.json({ error: "Invalid check-out date." }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (typeof phone !== "string" || phone.trim().length < 7) return NextResponse.json({ error: "Enter a valid contact number." }, { status: 400 });
  const paxNumber = pax !== undefined && pax !== null && pax !== "" ? Number(pax) : null;
  if (paxNumber !== null && (!Number.isFinite(paxNumber) || paxNumber < 1 || !Number.isInteger(paxNumber))) {
    return NextResponse.json({ error: "Number of guests must be a positive whole number." }, { status: 400 });
  }
  if (typeof specialRequest === "string" && specialRequest.length > 1000) {
    return NextResponse.json({ error: "Special request is too long." }, { status: 400 });
  }

  const unit = await prisma.unit.findUnique({ where: { id: unitId, active: true }, select: { id: true, shortName: true } });
  if (!unit) return NextResponse.json({ error: "That unit isn't available." }, { status: 404 });

  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // Price is always computed server-side from the real Booking Engine quote
  // — never trust a client-supplied amount for what a guest pays.
  const quote = quotePrice(stayType, new Date(date), checkOutDate ? new Date(checkOutDate) : null, settings, settings.dpFee);

  const guest = await findOrCreateGuestByEmail(email, name.trim());

  // Same bookingSchema every staff-side booking is validated against — no
  // reason the guest path should skip real shape/type validation just
  // because most of its fields are also checked by hand above.
  const parsed = bookingSchema.safeParse({
    unitId,
    date,
    checkOutDate: checkOutDate || null,
    stayType,
    guests: [name.trim()],
    pax: paxNumber,
    contactNumber: phone.trim(),
    platform: "Direct",
    // Always the full amount currently owed — a down-payment choice doesn't
    // reduce this until the down payment is actually verified (see
    // pricingService/bookingService comments): dpAmount only ever means
    // "collected," never "intended."
    amount: quote.total,
    paid: false,
    specialRequest: specialRequest || null,
    originalAmount: quote.standardTotal,
    discountPct: quote.discountPct,
    paymentType: paymentType === "down_payment" ? "down_payment" : "full",
    intendedDpAmount: paymentType === "down_payment" ? quote.dpAmount : null,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking details." }, { status: 400 });
  }

  const result = await createGuestBooking(guest.id, parsed.data);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  // Best-effort — never block the booking response on email delivery.
  sendBookingConfirmationEmail(email, {
    guestName: name.trim(),
    unitName: unit.shortName,
    confirmationNumber: result.booking.confirmationNumber ?? "",
    date: result.booking.date.toISOString(),
    stayType: result.booking.stayType,
    total: quote.total,
    paymentType: result.booking.paymentType,
    dpAmount: quote.dpAmount,
    balanceDue: quote.balanceDue,
  }).catch(() => {});

  const res = NextResponse.json({ ok: true, booking: result.booking, quote }, { status: 201 });
  // Sign the guest in immediately — no separate email round-trip needed
  // just to reach the same-page payment step or /my-bookings right after.
  // The magic-link email above still works independently as a way back in
  // on another device/session.
  const sessionToken = await mintGuestSessionToken(guest);
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
