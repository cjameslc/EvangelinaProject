import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Owner/Co-owner/Booker inbox for Housekeeping Workforce Management events
// — see notifyStaff() in src/lib/bookingEngine/notificationService.ts for
// what writes here. Self-scoped (userId = the caller) same as the guest
// notification endpoints already do for GuestNotification — but the
// multi-staycation switcher means "self" alone isn't enough anymore: a
// unit-tied notification generated while viewing one property must not
// keep showing while the same identity is switched into another.
// unitId has no real Prisma relation (a plain denormalized string, not a
// unit_ Unit? @relation) so this filters in two steps rather than a
// nested `unit: { ownerId }` where — cheap regardless, unit counts per
// owner are small. A null-unitId notification (an account-level notice,
// not tied to any specific property's unit) always shows.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const ownerUnitIds = (await prisma.unit.findMany({ where: { ownerId: user.ownerId }, select: { id: true } })).map((u) => u.id);
  const ownerScope = { OR: [{ unitId: null }, { unitId: { in: ownerUnitIds } }] };

  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "1";
  const notifications = await prisma.staffNotification.findMany({
    where: { userId: user.id, ...ownerScope, ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = await prisma.staffNotification.count({ where: { userId: user.id, read: false, ...ownerScope } });
  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  if (body.markAllRead) {
    await prisma.staffNotification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const { count } = await prisma.staffNotification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
  if (count === 0) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
