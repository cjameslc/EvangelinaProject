import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { createGuestBooking } from "@/lib/bookingService";
import { bookingSchema } from "@/lib/validation";
import { quotePrice, applyCouponDiscount } from "@/lib/bookingEngine/pricingService";
import { checkCoupon } from "@/lib/bookingEngine/couponService";
import { findOrCreateGuestByEmail } from "@/lib/bookingEngine/guestService";
import { getCachedBookingSettings } from "@/lib/bookingEngine/settingsCache";
import { getDefaultOwnerId } from "@/lib/ownerScope";
import { normalizeGuestCheckOutDate } from "@/lib/bookingEngine/guestCheckout";
import { isStayTypeBookableNow } from "@/lib/bookingEngine/bookingWindow";
import { isPastManilaDate } from "@/lib/manilaTime";
import { mintGuestSessionToken, guestCookieOptions, GUEST_COOKIE_NAME } from "@/lib/guestSession";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { createGuestAccessCode } from "@/lib/access/service";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

const VALID_STAY_TYPES: StayType[] = ["Daycation", "Night", "Full", "Flexible"];

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export async function POST(req: NextRequest) {
  // No guest session exists yet at this point (this route is *how* one
  // gets created) — keyed by IP, same convention as the assistant route's
  // anonymous-visitor limiter. This is the one write in the whole guest
  // surface that creates a real Booking row, calls out to TTLock for a real
  // access code, and sends a real email, yet previously had zero
  // throttling — every other guest write (feedback, payment-proof upload,
  // login) already had this.
  const limited = rateLimit(`guest-booking:${clientIp(req)}`, 8, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down and try again in a bit." }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { unitId, date, checkOutDate, stayType, name, email, phone, pax, specialRequest, paymentType, checkInTime, checkOutTime, couponCode } = body;
  if (couponCode !== undefined && couponCode !== null && typeof couponCode !== "string") {
    return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
  }
  if (typeof unitId !== "string" || !unitId || !isValidDateString(date) || !stayType || !VALID_STAY_TYPES.includes(stayType)) {
    return NextResponse.json({ error: "Missing or invalid unit, date, or stay type." }, { status: 400 });
  }
  if (isPastManilaDate(date)) {
    return NextResponse.json({ error: "Check-in date can't be in the past." }, { status: 400 });
  }
  if (paymentType !== undefined && paymentType !== "full" && paymentType !== "down_payment") {
    return NextResponse.json({ error: "Invalid payment type." }, { status: 400 });
  }
  if (checkOutDate !== undefined && checkOutDate !== null && !isValidDateString(checkOutDate)) {
    return NextResponse.json({ error: "Invalid check-out date." }, { status: 400 });
  }
  if (stayType === "Flexible" && (typeof checkInTime !== "string" || !checkInTime || typeof checkOutTime !== "string" || !checkOutTime)) {
    return NextResponse.json({ error: "A Flexible stay needs both a check-in and check-out time." }, { status: 400 });
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

  // None of these three depend on each other — parallelize instead of
  // three sequential round trips (unit lookup only rarely fails, so the
  // rare wasted guest upsert on an invalid unitId is worth the latency win
  // on every valid booking, which is the overwhelming common case).
  const [unit, guest] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId, active: true }, select: { id: true, shortName: true, ownerId: true } }),
    findOrCreateGuestByEmail(email, name.trim()),
  ]);
  if (!unit) return NextResponse.json({ error: "That unit isn't available." }, { status: 404 });
  // The unit being booked already tells us the real owner — no need to
  // fall back to getDefaultOwnerId() here the way booking-quote/
  // coupon-check do (they only ever see an aggregate unit list, never one
  // specific unit).
  const resolvedOwnerId = unit.ownerId ?? (await getDefaultOwnerId())!;
  const [settings, owner] = await Promise.all([
    getCachedBookingSettings(resolvedOwnerId),
    prisma.owner.findUnique({ where: { id: resolvedOwnerId }, select: { businessName: true, status: true } }),
  ]);
  // Owner.status was a real field with no actual enforcement anywhere until
  // now — see the matching sign-in block in auth.ts's authorize() for the
  // other half of this schema-documented promise ("its booking page stops
  // accepting new bookings"). Same generic message as unit-not-found —
  // a suspended tenant's booking page shouldn't read as a distinct,
  // debuggable "why is this blocked" case to a guest poking at it.
  if (owner?.status === "SUSPENDED") {
    return NextResponse.json({ error: "That unit isn't available." }, { status: 404 });
  }
  // Same-day booking window — deliberately the exact same generic message
  // as "unit not found," so this never reads as its own distinct rule.
  if (!isStayTypeBookableNow(stayType, date, checkInTime)) {
    return NextResponse.json({ error: "That unit isn't available." }, { status: 404 });
  }

  // Never trust a client-supplied checkOutDate for a Night stay — always
  // exactly one night, ignoring whatever the client sent. This is what
  // actually gets persisted (and mirrored to the calendar), not just what
  // the quote is computed against, so the two can never disagree.
  const normalizedCheckOutDate = normalizeGuestCheckOutDate(stayType, new Date(date), checkOutDate ? new Date(checkOutDate) : null);
  const normalizedCheckOutDateStr = normalizedCheckOutDate ? normalizedCheckOutDate.toISOString().slice(0, 10) : null;

  // Price is always computed server-side from the real Booking Engine quote
  // — never trust a client-supplied amount for what a guest pays.
  let quote = quotePrice(stayType, new Date(date), normalizedCheckOutDate, settings, settings.dpFee, checkInTime);

  // Same discipline as amount above — a client-supplied discount is never
  // trusted; if a coupon code was sent, it's re-validated fresh against the
  // real (server-computed) subtotal right here. If it's no longer valid
  // (expired, deactivated, or used up since the guest last saw it applied),
  // the whole booking is rejected rather than silently charging full price
  // for what the guest believes is a discounted stay.
  let appliedCouponCode: string | null = null;
  let couponDiscountAmount: number | null = null;
  if (typeof couponCode === "string" && couponCode.trim()) {
    const couponCheck = await checkCoupon(couponCode, quote.total, resolvedOwnerId);
    if (!couponCheck.ok) return NextResponse.json({ error: couponCheck.error }, { status: 400 });
    quote = applyCouponDiscount(quote, couponCheck.discountAmount, settings.dpFee);
    appliedCouponCode = couponCheck.code;
    couponDiscountAmount = couponCheck.discountAmount;
  }

  // Same bookingSchema every staff-side booking is validated against — no
  // reason the guest path should skip real shape/type validation just
  // because most of its fields are also checked by hand above.
  const parsed = bookingSchema.safeParse({
    unitId,
    date,
    checkOutDate: normalizedCheckOutDateStr,
    stayType,
    checkInTime: stayType === "Flexible" ? checkInTime : null,
    checkOutTime: stayType === "Flexible" ? checkOutTime : null,
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
    couponCode: appliedCouponCode,
    couponDiscountAmount,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking details." }, { status: 400 });
  }

  const result = await createGuestBooking(guest.id, parsed.data);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  // Best-effort, never awaited into the response — createGuestAccessCode()
  // itself never throws (see src/lib/access/service.ts), but this is
  // never allowed to be the thing that delays or breaks a booking either
  // way. Runs after the response is already being built below; the guest's
  // door-code reveal on /my-bookings just won't have a code yet for the
  // first second or two after booking. Wrapped in waitUntil() so Vercel's
  // Node.js runtime doesn't freeze/recycle the function before this
  // finishes — a fire-and-forget promise with no waitUntil is only
  // "best-effort" by accident (it happens to finish before the runtime
  // tears down), not by guarantee, and this call's whole reason to exist is
  // its retry/fallback logic, which needs the time to actually run.
  waitUntil(
    createGuestAccessCode({
      bookingId: result.booking.id,
      unitId: unitId,
      guestId: guest.id,
      stayType: result.booking.stayType,
      date: result.booking.date,
      checkOutDate: result.booking.checkOutDate,
      checkInTime: result.booking.checkInTime,
      checkOutTime: result.booking.checkOutTime,
      platform: result.booking.platform,
    }).catch(() => {})
  );

  // Best-effort — never block the booking response on email delivery.
  waitUntil(
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
      businessName: owner?.businessName,
    }).catch(() => {})
  );

  const res = NextResponse.json({ ok: true, booking: result.booking, quote }, { status: 201 });
  // Sign the guest in immediately — no separate email round-trip needed
  // just to reach the same-page payment step or /my-bookings right after.
  // The magic-link email above still works independently as a way back in
  // on another device/session.
  const sessionToken = await mintGuestSessionToken(guest);
  res.cookies.set(GUEST_COOKIE_NAME, sessionToken, guestCookieOptions);
  return res;
}
