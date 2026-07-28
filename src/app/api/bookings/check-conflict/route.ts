import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { bookingsConflict } from "@/lib/calendarMirror";

// Live conflict check used by the Booking form as the user picks a unit/
// date/time — same centralized bookingsConflict() the POST/PATCH routes
// enforce server-side, so the form can warn before submit without the
// validation logic ever drifting between client feedback and the real gate.
export async function GET(req: NextRequest) {
  const { error } = await requireUser();
  if (error) return error;

  const { searchParams } = req.nextUrl;
  const unitId = searchParams.get("unitId");
  const date = searchParams.get("date");
  const stayType = searchParams.get("stayType");
  const checkOutDate = searchParams.get("checkOutDate");
  const checkInTime = searchParams.get("checkInTime");
  const checkOutTime = searchParams.get("checkOutTime");
  const excludeId = searchParams.get("excludeId");

  if (!unitId || !date || !stayType) {
    return NextResponse.json({ conflict: false });
  }

  const others = await prisma.booking.findMany({
    where: { unitId, cancelledAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { stayType: true, date: true, checkOutDate: true, checkInTime: true, checkOutTime: true },
  });

  const conflict = others.some((b) =>
    bookingsConflict({ stayType, date: new Date(date), checkOutDate: checkOutDate ? new Date(checkOutDate) : null, checkInTime, checkOutTime }, b)
  );

  return NextResponse.json({ conflict });
}
