import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit, isUnitInScope, forbiddenUnitScopeResponse } from "@/lib/session";
import { hasActionAccess } from "@/lib/actionAccess";
import { openCleaningCalendarBlock, closeCleaningCalendarBlock, clearCleaningCalendarBlock } from "@/lib/calendarMirror";
import { linkHousekeepingCredentialToCleaning, releaseHousekeepingCredentialForCleaning, ensureHousekeepingCredentialOnStart } from "@/lib/access/service";
import { notifyStaff } from "@/lib/bookingEngine/notificationService";

// Grace period before a cleaning start counts as "Late" — spec section 11.
const TARDINESS_GRACE_MINUTES = 10;
// Anything later than this isn't a real tardiness signal — it's a
// mis-paired booking (a legacy-migration checkout with no realistic
// checkOutTime, or a clean logged against the wrong booking). Observed for
// real on test data: an "Avg delay" north of 5,000 minutes on a handful of
// old records. Excluded rather than clamped, so it doesn't quietly drag
// the average toward a still-misleading (if smaller) number.
const MAX_PLAUSIBLE_LATE_MINUTES = 24 * 60;

/** Scheduled clean time is the booking's own checkout — the natural "this
 * unit needs cleaning starting around now" moment already used everywhere
 * else in this app (upcomingBookings in housekeeping/page.tsx). Returns
 * null for ad-hoc cleans with no bookingId (nothing to be late against) and
 * for implausible outliers (see MAX_PLAUSIBLE_LATE_MINUTES). */
async function minutesLate(bookingId: string | null | undefined, startedAt: Date): Promise<number | null> {
  if (!bookingId) return null;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { checkOutDate: true, date: true, checkOutTime: true } });
  if (!booking) return null;
  const scheduledDate = booking.checkOutDate ?? booking.date;
  const [h, m] = (booking.checkOutTime ?? "12:00").split(":").map(Number);
  const scheduled = new Date(scheduledDate);
  scheduled.setUTCHours(h, m, 0, 0);
  const lateMs = startedAt.getTime() - scheduled.getTime() - TARDINESS_GRACE_MINUTES * 60 * 1000;
  const lateMinutes = lateMs > 0 ? Math.round(lateMs / 60000) : null;
  return lateMinutes !== null && lateMinutes <= MAX_PLAUSIBLE_LATE_MINUTES ? lateMinutes : null;
}

// PATCH body: { checked?: boolean[][], status?: "todo"|"cleaning"|"clean", byName?: string, start?: boolean, end?: boolean, bookingId?: string, photoUrls?: string[] }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!hasActionAccess("housekeeping.edit", user.role, user.additionalActionAccess)) return new Response("Forbidden", { status: 403 });
  // Was missing entirely — every other unit-targeted mutation route in this
  // app (Calendar, Bookings) checks isUnitInScope before writing; this one
  // only checked the role, never whether params.id even belongs to this
  // user's own tenant. Any Housekeeping/Booker/Admin session could PATCH
  // any unit ID on the platform, including a different owner's.
  if (!await isUnitInScope(user, params.id)) return forbiddenUnitScopeResponse(user);

  const body = await req.json();

  // Was missing entirely — the housekeeping *schedule* (upcomingBookings in
  // housekeeping/page.tsx) already excludes cancelled bookings so the UI
  // never offers one as something to clean, but this write path trusted
  // whatever bookingId a request sent with no check of its own. Confirmed
  // for real: a direct PATCH with a cancelled booking's id still started
  // (and would finish) a real cleaning cycle credited to that booking,
  // producing exactly the spurious "Cleaned" calendar entry the schedule
  // fix was meant to prevent. Reject at the source instead of trusting the
  // caller went through the normal UI.
  if (body.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: body.bookingId }, select: { unitId: true, cancelledAt: true } });
    if (!booking || booking.unitId !== params.id || booking.cancelledAt) {
      return NextResponse.json({ error: "That booking can't be cleaned for — it's cancelled or no longer valid." }, { status: 400 });
    }
  }

  const data: any = {};
  if (body.checked) data.checked = body.checked;
  if (body.status) data.status = body.status;
  if (body.byName !== undefined) data.byName = body.byName;
  if (body.start) { data.startedAt = new Date(); data.overdueNotifiedAt = null; }
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
  let cleaningLogId: string | null = null;
  let cleaningEmployeeId: string | null = null;

  // Single indexed row read, cheap even on this hot path — the QA-flagged
  // audit trail gap (Start cleaning/Complete cleaning previously logged the
  // new status only, never what it changed from).
  const priorState = await prisma.housekeepingUnitState.findUnique({ where: { unitId: params.id }, select: { status: true, byName: true } });

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
      const employee = await tx.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
      cleaningEmployeeId = employee?.id ?? null;
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
        const log = await tx.cleaningLog.upsert({
          where: { bookingId: body.bookingId },
          update: logData,
          create: { ...logData, bookingId: body.bookingId },
        });
        cleaningLogId = log.id;
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
        const log = await tx.cleaningLog.create({ data: { ...logData, bookingId: null } });
        cleaningLogId = log.id;
      }
    }

    return state;
  });

  // Mirror onto the calendar so /calendar shows a unit is currently being
  // cleaned — same mirroring pattern used for bookings (syncCalendarMirror).
  if (body.start) await openCleaningCalendarBlock(params.id, data.startedAt, body.bookingId ?? null);
  if (body.status === "todo") await clearCleaningCalendarBlock(params.id);
  if (body.status === "clean" && body.end) await closeCleaningCalendarBlock(params.id, state.endedAt ?? new Date());

  // Housekeeping Workforce Management: tardiness on start, credential
  // release + completion notice on finish. Both best-effort, outside the
  // transaction above, same "not a record of truth" reasoning as the
  // calendar mirroring right above — a notification/credential hiccup must
  // never leave a cleaning stuck or roll back real checklist progress.
  if (body.start || (body.status === "clean" && body.end)) {
    const unit = await prisma.unit.findUnique({ where: { id: params.id }, select: { shortName: true } });
    const unitName = unit?.shortName ?? "unit";
    const bookerId = body.bookingId
      ? (await prisma.booking.findUnique({ where: { id: body.bookingId }, select: { bookerId: true } }))?.bookerId ?? undefined
      : undefined;

    if (body.start) {
      const employee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true, name: true } });
      const employeeName = employee?.name ?? user.name ?? "A housekeeper";
      const late = await minutesLate(body.bookingId ?? null, data.startedAt);
      if (late !== null) {
        await notifyStaff({ type: "cleaning.late", unitId: params.id, unitName, employeeName, minutesLate: late, bookerId });
      } else {
        await notifyStaff({ type: "cleaning.started", unitId: params.id, unitName, employeeName, bookerId });
      }
      // Spec section 3, step 5 — request the assigned temporary credential
      // as part of starting the clean itself, not only when an Owner/
      // Booker happened to pre-generate one. Only real HOUSEKEEPING-role
      // staff get an actual code — an Owner/Admin doing a clean themselves
      // has no reason to lock themselves out behind a temporary passcode.
      if (employee?.id && user.role === "HOUSEKEEPING") {
        await ensureHousekeepingCredentialOnStart({ unitId: params.id, assignedEmployeeId: employee.id });
      }
    }

    if (body.status === "clean" && body.end && cleaningLogId && cleaningEmployeeId) {
      await linkHousekeepingCredentialToCleaning({ unitId: params.id, employeeId: cleaningEmployeeId, cleaningLogId }).catch(() => {});
      await releaseHousekeepingCredentialForCleaning(cleaningLogId).catch(() => {});

      const employee = await prisma.employee.findUnique({ where: { id: cleaningEmployeeId }, select: { name: true } });
      const durationMinutes = state.startedAt && state.endedAt
        ? Math.max(0, Math.round((state.endedAt.getTime() - state.startedAt.getTime()) / 60000))
        : 0;
      await notifyStaff({ type: "cleaning.completed", unitId: params.id, unitName, employeeName: employee?.name ?? "A housekeeper", durationMinutes, bookerId });
    }
  }

  await logAudit(user.id, "housekeeping.update", "HousekeepingUnitState", params.id, {
    before: { status: priorState?.status ?? "todo", byName: priorState?.byName ?? null },
    after: { status: body.status, byName: state.byName },
  });
  return NextResponse.json(state);
}
