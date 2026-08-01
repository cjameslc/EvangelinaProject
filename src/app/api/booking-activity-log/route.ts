import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isUnitInScope, unitWhere, logAudit } from "@/lib/session";
import { canEditBookings } from "@/lib/rbac";
import { bookingActivityLogSchema } from "@/lib/validation";

const LOG_INCLUDE = {
  unit: { select: { id: true, name: true, shortName: true } },
  createdBy: { select: { id: true, name: true } },
};

// Defaults to the current calendar month (Manila time) — the log is meant
// to be read as "what fell through this month," same framing as the Bookings
// tab's own "This month" date filter, not an unbounded history dump.
function monthRange(monthParam: string | null) {
  const now = new Date();
  const [year, month] = (monthParam ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;

  const { start, end } = monthRange(req.nextUrl.searchParams.get("month"));
  const entries = await prisma.bookingActivityLog.findMany({
    where: { ...unitWhere(user), transactionDate: { gte: start, lt: end } },
    orderBy: { transactionDate: "desc" },
    include: LOG_INCLUDE,
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditBookings(user.role as any)) {
    return NextResponse.json({ error: "You don't have access to log booking transactions." }, { status: 403 });
  }

  let body;
  try {
    body = bookingActivityLogSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please check the values you entered." }, { status: 400 });
  }
  if (body.unitId && !isUnitInScope(user, body.unitId)) {
    return NextResponse.json({ error: "You don't have access to that unit." }, { status: 403 });
  }

  const own = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });

  const entry = await prisma.bookingActivityLog.create({
    data: {
      type: body.type,
      unitId: body.unitId || null,
      guestName: body.guestName.trim(),
      contactNumber: body.contactNumber?.trim() || null,
      transactionDate: new Date(body.transactionDate),
      amount: body.amount ?? null,
      note: body.note?.trim() || null,
      createdById: own?.id ?? null,
    },
    include: LOG_INCLUDE,
  });
  await logAudit(user.id, "bookingActivityLog.create", "BookingActivityLog", entry.id, { type: entry.type, unitId: entry.unitId });
  return NextResponse.json(entry, { status: 201 });
}
