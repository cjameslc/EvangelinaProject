import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { canEditHousekeeping } from "@/lib/rbac";
import { openCleaningCalendarBlock, closeCleaningCalendarBlock, clearCleaningCalendarBlock } from "@/lib/calendarMirror";

// PATCH body: { checked?: boolean[][], status?: "todo"|"cleaning"|"clean", byName?: string, start?: boolean, end?: boolean, bookingId?: string, photoUrls?: string[] }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canEditHousekeeping(user.role as any)) return new Response("Forbidden", { status: 403 });

  const body = await req.json();
  const existing = await prisma.housekeepingUnitState.findUnique({ where: { unitId: params.id } });

  const data: any = {};
  if (body.checked) data.checked = body.checked;
  if (body.status) data.status = body.status;
  if (body.byName !== undefined) data.byName = body.byName;
  if (body.start) data.startedAt = new Date();
  if (body.end) data.endedAt = new Date();
  if (body.photoUrls) data.photoUrls = body.photoUrls;
  // Records WHICH booking's checkout this finished clean satisfies —
  // accumulated (not overwritten), since a unit can have more than one
  // checkout in a day and a single flat "clean" would otherwise wrongly
  // cover every checkout that day, not just the one just cleaned. See the
  // schema comment on cleanedBookingIds.
  if (body.status === "clean" && body.end && body.bookingId) {
    const prevIds: string[] = Array.isArray(existing?.cleanedBookingIds) ? (existing!.cleanedBookingIds as string[]) : [];
    data.cleanedBookingIds = prevIds.includes(body.bookingId) ? prevIds : [...prevIds, body.bookingId];
  }
  if (body.status === "todo") {
    data.startedAt = null;
    data.endedAt = null;
    data.byName = null;
    data.cleanedBookingIds = [];
    data.photoUrls = [];
  }

  const state = await prisma.housekeepingUnitState.upsert({
    where: { unitId: params.id },
    update: data,
    create: { unitId: params.id, checked: body.checked ?? [], status: body.status ?? "todo", byName: body.byName ?? null, cleanedBookingIds: data.cleanedBookingIds ?? [], photoUrls: body.photoUrls ?? [] },
  });

  // Mirror onto the calendar so /calendar shows a unit is currently being
  // cleaned — same mirroring pattern used for bookings (syncCalendarMirror).
  if (body.start) await openCleaningCalendarBlock(params.id, data.startedAt, body.bookingId ?? null);
  if (body.status === "todo") await clearCleaningCalendarBlock(params.id);

  // When a clean finishes, write a permanent log entry (attributed to
  // whoever's logged in — the person actually doing the clean) and close
  // off the calendar's in-progress marker. One cleaning per checkout: if a
  // log already exists for this booking's checkout (a double-click, or a
  // repeated Start/Finish cycle on the same pending checkout), update that
  // same row instead of inserting a new one. Only cleans with no bookingId
  // (nothing scheduled) always create fresh — there's no id to dedupe on.
  if (body.status === "clean" && body.end) {
    const employee = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    const logData = {
      unitId: params.id,
      employeeId: employee?.id ?? null,
      startedAt: state.startedAt ?? new Date(),
      endedAt: state.endedAt ?? new Date(),
      photoUrls: (state.photoUrls.length ? state.photoUrls : null) as any,
    };
    if (body.bookingId) {
      // bookingId is a unique column — this upsert is atomic, so even two
      // Finish requests landing at the exact same moment (a genuine
      // simultaneous double-click) still resolve to one row, not a race.
      await prisma.cleaningLog.upsert({
        where: { bookingId: body.bookingId },
        update: logData,
        create: { ...logData, bookingId: body.bookingId },
      });
    } else {
      await prisma.cleaningLog.create({ data: { ...logData, bookingId: null } });
    }
    await closeCleaningCalendarBlock(params.id, state.endedAt ?? new Date());
  }

  await logAudit(user.id, "housekeeping.update", "HousekeepingUnitState", params.id, { status: body.status });
  return NextResponse.json(state);
}
