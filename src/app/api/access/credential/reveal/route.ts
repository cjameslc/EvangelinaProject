import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope } from "@/lib/session";
import { canRevealAccessCredential } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { revealCredentialForBooking } from "@/lib/access/service";

// Centralized staff-facing reveal — every credential/wifi/room-info view
// funnels through here (and gets logged) instead of any route reading
// AccessCredential.code or Unit.wifiPassword/doorCode directly off a bulk
// list payload. Same discipline the guest-facing side already follows
// (docs/Security.md: "the server never includes wifiPassword/doorCode in
// any page payload sent to the client... only a hasWifi/hasDoorCode
// boolean") — this is that same "reveal on demand, not in bulk" rule
// applied to staff.
//
// Prefers the real dynamic AccessCredential (a live TTLock passcode, or a
// reserve-pool fallback) when one's active; falls back to the unit's
// static doorCode otherwise — so a booking with no dynamic credential at
// all (Airbnb import, a staff-logged booking that never went through the
// guest portal) still gets *something* useful to hand the guest, not a
// dead end. Never 404s just because there's no dynamic code — only when
// the booking/unit itself can't be found.
export async function POST(req: Request) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canRevealAccessCredential(user.role)) return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      unitId: true, confirmationNumber: true,
      unit: { select: { name: true, shortName: true, unitNumber: true, wifiSsid: true, wifiPassword: true, doorCode: true, checkInInstructions: true } },
    },
  });
  if (!booking || !await isUnitInScope(user, booking.unitId)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const credential = await revealCredentialForBooking(bookingId, user.id);
  const code = credential?.code ?? booking.unit.doorCode ?? null;
  const codeSource: "dynamic" | "static" | null = credential ? "dynamic" : booking.unit.doorCode ? "static" : null;

  // revealCredentialForBooking already logs "viewed" for the dynamic-
  // credential case — this covers the rest (static door code and/or wifi
  // being handed to staff), so a reveal is audited either way.
  if (!credential && (code || booking.unit.wifiPassword)) {
    await logAudit(user.id, "access.guest_info.viewed", "Unit", booking.unitId, { bookingId, source: "static" });
  }

  return NextResponse.json({
    id: credential?.id ?? null,
    code,
    codeSource,
    validFrom: credential?.validFrom ?? null,
    validUntil: credential?.validUntil ?? null,
    unitName: booking.unit.shortName || booking.unit.name,
    unitNumber: booking.unit.unitNumber,
    wifiSsid: booking.unit.wifiSsid,
    wifiPassword: booking.unit.wifiPassword,
    checkInInstructions: booking.unit.checkInInstructions,
    confirmationNumber: booking.confirmationNumber,
  });
}
