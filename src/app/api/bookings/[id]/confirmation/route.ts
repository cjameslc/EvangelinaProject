import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { generateConfirmationNumber } from "@/lib/bookingEngine/confirmationNumber";

// How long an OWNER_ADMIN's manual "reactivate" grants access for — a
// deliberate, visible-in-the-UI window, not indefinite.
const REACTIVATE_DAYS = 30;

/**
 * OWNER_ADMIN-only actions on a booking's confirmation number/booking ID —
 * separate from the general PATCH /api/bookings/[id] (which can never
 * touch confirmationNumber; see bookingSchema) precisely so this stays a
 * deliberate, audited, single-purpose action rather than something that
 * could slip through as a side effect of an ordinary edit.
 *
 * "reactivate": extends validity past the normal stay-based window (see
 * confirmationValidity.ts) — e.g. for a guest who needs door-code/WiFi
 * access again after checkout, or whose code expired before they signed
 * in. "regenerate": issues a brand-new code and clears any expiry
 * override, for a lost/compromised code — the old code stops working the
 * instant this runs, since confirmationNumber is @unique and the row now
 * holds a different value.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const limited = rateLimit(`booking-confirmation:${user.id}`, 30, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const existing = await prisma.booking.findUnique({ where: { id: params.id }, select: { id: true, unitId: true, confirmationNumber: true } });
  if (!existing) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!await isUnitInScope(user, existing.unitId)) return forbiddenUnitScopeResponse(user);

  const body = await req.json().catch(() => ({}));
  const action = body.action === "regenerate" ? "regenerate" : body.action === "reactivate" ? "reactivate" : null;
  if (!action) return NextResponse.json({ error: "action must be \"reactivate\" or \"regenerate\"." }, { status: 400 });

  if (action === "reactivate") {
    if (!existing.confirmationNumber) {
      return NextResponse.json({ error: "This booking has no booking ID to reactivate — use \"Generate new code\" instead." }, { status: 400 });
    }
    const confirmationOverrideUntil = new Date(Date.now() + REACTIVATE_DAYS * 24 * 60 * 60 * 1000);
    const booking = await prisma.booking.update({ where: { id: params.id }, data: { confirmationOverrideUntil } });
    await logAudit(user.id, "booking.confirmation.reactivate", "Booking", booking.id, { confirmationOverrideUntil });
    return NextResponse.json({ ok: true, confirmationNumber: booking.confirmationNumber, confirmationOverrideUntil: booking.confirmationOverrideUntil });
  }

  const confirmationNumber = await generateConfirmationNumber(existing.unitId);
  const booking = await prisma.booking.update({ where: { id: params.id }, data: { confirmationNumber, confirmationOverrideUntil: null } });
  await logAudit(user.id, "booking.confirmation.regenerate", "Booking", booking.id, { from: existing.confirmationNumber, to: confirmationNumber });
  return NextResponse.json({ ok: true, confirmationNumber: booking.confirmationNumber, confirmationOverrideUntil: booking.confirmationOverrideUntil });
}
