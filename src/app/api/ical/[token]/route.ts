import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateICS } from "@/lib/ical";
import { calendarBlockEndDate } from "@/lib/calendarMirror";

// Minimal in-memory sliding-window limiter — per warm serverless instance
// only (Vercel doesn't share memory across instances/cold starts), so this
// isn't a hard guarantee, but it meaningfully slows down a single source
// hammering the endpoint or brute-forcing tokens without needing an external
// rate-limit service for what's otherwise a low-traffic, read-only feed.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestLog = new Map<string, number[]>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5000) requestLog.clear(); // crude bound on unbounded growth
  return recent.length > RATE_LIMIT_MAX;
}

// Public, unauthenticated export — secured only by the unguessable token in
// the URL, the same model every PMS/Airbnb iCal integration uses since the
// consuming side (Airbnb) can't send auth headers of its own. The URL
// intentionally carries only the token (no unit ID), so it never leaks an
// internal identifier even to whoever holds the link.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/i, "");
  if (!token) return new Response("Not found", { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`${ip}:${token}`)) {
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  }

  const unit = await prisma.unit.findUnique({ where: { icalToken: token }, select: { id: true, name: true } });
  if (!unit) return new Response("Not found", { status: 404 });

  // Every real Booking row is by definition an active reservation — a
  // cancelled/removed booking is deleted outright (see DELETE
  // /api/bookings/[id]), so there's no separate "cancelled" state to filter
  // out here; the query already excludes it just by not existing anymore.
  const bookings = await prisma.booking.findMany({
    where: { unitId: unit.id },
    select: { id: true, date: true, checkOutDate: true, stayType: true, guests: true, platform: true, updatedAt: true },
  });

  const ics = generateICS({
    calName: unit.name,
    events: bookings.map((b) => ({
      uid: `${b.id}@evangelinas-staycation`,
      summary: "Reserved",
      start: b.date,
      end: calendarBlockEndDate(b.stayType, b.date, b.checkOutDate) ?? new Date(b.date.getTime() + 24 * 3600 * 1000),
      location: unit.name,
      description: b.guests.length ? `${b.guests.join(", ")} · via ${b.platform}` : undefined,
      lastModified: b.updatedAt,
    })),
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${unit.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
