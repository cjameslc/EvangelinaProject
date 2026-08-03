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

  const data: any = {};
  if (body.checked) data.checked = body.checked;
  if (body.status) data.status = body.status;
  if (body.byName !== undefined) data.byName = body.byName;
  if (body.start) data.startedAt = new Date();
  if (body.end) data.endedAt = new Date();
  if (body.photoUrls) data.photoUrls = body.photoUrls;
  if (body.status === "todo") {
    data.startedAt = null;
    data.endedAt = null;
    data.byName = null;
    data.cleanedBookingIds = [];
    data.photoUrls = [];
  }

  // The state upsert and (when a clean finishes) the cleaning-log write and
  // the booking's cleanerId credit are one unit of work — a failure between
  // them used to be able to leave a unit showing "clean" with no log row and
  // no payroll credit for whoever actually did it, silently under-crediting
  // real work. The calendar-mirror calls and audit log below stay best-effort
  // follow-ups outside the transaction, same as this codebase's other write
  // paths (e.g. bookingService.ts) — they're not money/records-of-truth.
  const state = await prisma.$transaction(async (tx) => {
    // Read-then-append, done inside the transaction rather than before it —
    // this field accumulates (see the schema comment on cleanedBookingIds)
    // rather than overwrites, so two different checkouts on the same unit
    // finishing cleaning within moments of each other both need to see each
    // other's append, not just whichever wrote last. Reading this outside
    // the transaction (as it originally did) meant both requests could read
    // the same stale array and one's append would silently overwrite the
    // other's inside the upsert below.
    if (body.status === "clean" && body.end && body.bookingId) {
      const existing = await tx.housekeepingUnitState.findUnique({ where: { unitId: params.id }, select: { cleanedBookingIds: true } });
      const prevIds: string[] = Array.isArray(existing?.cleanedBookingIds) ? (existing!.cleanedBookingIds as string[]) : [];
      data.cleanedBookingIds = prevIds.includes(body.bookingId) ? prevIds : [...prevIds, body.bookingId];
    }

    const state = await tx.housekeepingUnitState.upsert({
      where: { unitId: params.id },
      update: data,
      create: { unitId: params.id, checked: body.checked ?? [], status: body.status ?? "todo", byName: body.byName ?? null, cleanedBookingIds: data.cleanedBookingIds ?? [], photoUrls: body.photoUrls ?? [] },
    });

    // When a clean finishes, write a permanent log entry (attributed to
    // whoever's logged in — the person actually doing the clean). One
    // cleaning per checkout: if a log already exists for this booking's
    // checkout (a double-click, or a repeated Start/Finish cycle on the same
    // pending checkout), update that same row instead of inserting a new
    // one. Only cleans with no bookingId (nothing scheduled) always create
    // fresh — there's no id to dedupe on.
    if (body.status === "clean" && body.end) {
      const employee = await tx.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
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
        await tx.cleaningLog.upsert({
          where: { bookingId: body.bookingId },
          update: logData,
          create: { ...logData, bookingId: body.bookingId },
        });
        // Credit the booking to whoever actually did the clean — this was a
        // real, confirmed gap: CleaningLog.employeeId (this real-time record)
        // and Booking.cleanerId (what the Night Clean Bonus and cleaning
        // counts actually read) were two disconnected sources of truth.
        // Finishing a real clean through this tab never touched the
        // booking's own cleanerId, so staff who did the work through here
        // rather than being pre-assigned on the booking silently earned no
        // bonus credit for it. Only fills a gap (cleanerId currently unset)
        // — never overwrites an existing explicit assignment.
        if (employee?.id) {
          await tx.booking.updateMany({ where: { id: body.bookingId, cleanerId: null }, data: { cleanerId: employee.id } });
        }
      } else {
        await tx.cleaningLog.create({ data: { ...logData, bookingId: null } });
      }
    }

    return state;
  });

  // Mirror onto the calendar so /calendar shows a unit is currently being
  // cleaned — same mirroring pattern used for bookings (syncCalendarMirror).
  if (body.start) await openCleaningCalendarBlock(params.id, data.startedAt, body.bookingId ?? null);
  if (body.status === "todo") await clearCleaningCalendarBlock(params.id);
  if (body.status === "clean" && body.end) await closeCleaningCalendarBlock(params.id, state.endedAt ?? new Date());

  await logAudit(user.id, "housekeeping.update", "HousekeepingUnitState", params.id, { status: body.status });
  return NextResponse.json(state);
}
