import { useMemo } from "react";
import { peso, fmtDate, pesoCentavos, billCentavos, formatUnitDisplay } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { attentionKey } from "@/lib/attentionKey";
import { manilaDayKey as dayOf } from "@/lib/analytics/period";
import { isCompletedStay } from "./completedStay";
import type { Unit, Booking, HkState, AttentionFinding, Stock, Bill } from "../types";

/**
 * "Needs your attention" — cross-section of open Auditor findings, overdue
 * bills, and low stock. Purely a summary; each source's own page (Auditor /
 * Housekeeping) still owns the full record. Only genuinely overdue bills
 * are flagged here — "due soon" bills aren't surfaced.
 *
 * Kept as one cohesive hook — it's an inherently cross-cutting,
 * single-consumer rollup that reads a bag of otherwise-unrelated inputs, so
 * it isn't split apart by "owning domain" the way the rest of the Dashboard
 * was.
 */
export function useAttentionItems({
  attentionFindings,
  units,
  bookingsWeek,
  bookingsMonth,
  hkStates,
  cleaningLogsRecent,
  stocks,
  expenseRequestsMonth,
  pendingGuestRequests,
  dueBills,
  dueDateFor,
  billMeta,
  batteryStats,
  lockedUnits,
  batteryTier,
  upcomingCheckinRiskUnits,
  reserveCodeStats,
  dismissedKeys,
  todayIso,
}: {
  attentionFindings: AttentionFinding[];
  units: Unit[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
  hkStates: HkState[];
  cleaningLogsRecent: { id: string; unitId: string; startedAt: string; endedAt: string | null; employee: { name: string } | null }[];
  stocks: Stock[];
  expenseRequestsMonth: { id: string; category: string; amount: number; status: string; date: string; employee: { name: string } | null }[];
  pendingGuestRequests: { id: string; type: string; message: string | null; priority: string; photoUrl: string | null; createdAt: string; unit: { shortName: string } | null; guest: { name: string | null; email: string } | null }[];
  dueBills: Bill[];
  dueDateFor: (b: Bill) => Date | null;
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
  batteryStats: { healthy: number; low: number; critical: number; offline: number; average: number | null; lastUpdated: string | null };
  lockedUnits: Unit[];
  batteryTier: (pct: number | null | undefined) => "critical" | "low" | "healthy" | null;
  upcomingCheckinRiskUnits: { unit: Unit; nextCheckInAt: Date; tier: "critical" | "low" | "offline" }[];
  reserveCodeStats: { byUnit: Map<string, { total: number; available: number }>; total: number; available: number; inUse: number; exhaustedUnits: Unit[] };
  dismissedKeys: Set<string>;
  todayIso: string;
}) {
  // Feeds "Needs your attention" — every pending expense request waiting on
  // an owner decision in My Earnings' approval queue. Empty list = no item
  // pushed at all, same convention as every other automated check here.
  const pendingExpenseRequests = useMemo(
    () => expenseRequestsMonth.filter((e) => e.status === "PENDING"),
    [expenseRequestsMonth]
  );

  // Feeds "Needs your attention" — a clean marked done 10 minutes or less
  // after being started. Not proof anything's wrong (a small Daycation
  // turnover unit can genuinely be quick), just worth a glance — flags,
  // never blocks or auto-penalizes.
  const quickCleans = useMemo(
    () =>
      cleaningLogsRecent
        .filter((c) => c.endedAt)
        .map((c) => ({ ...c, minutes: Math.round((new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime()) / 60000) }))
        .filter((c) => c.minutes >= 0 && c.minutes <= 10),
    [cleaningLogsRecent]
  );

  const overdueBillsForAttention = dueBills.filter((b) => {
    const d = dueDateFor(b);
    return d && d < new Date(`${todayIso}T00:00:00Z`);
  });
  const lowStock = stocks.filter((s) => s.count <= LOW_STOCK_THRESHOLD);

  // bookingsWeek already covers "the last 7 days through any future date"
  // (no upper bound — see dashboard/page.tsx); bookingsMonth adds back the
  // earlier part of the current calendar month bookingsWeek would otherwise
  // miss. Deduped by id since a booking dated this month and within the
  // last 7 days appears in both. Feeds the conflict/unpaid-balance checks
  // below — a broader, still-cheap window than bookingsWeek alone, with no
  // extra query since both arrays are already fetched for other cards.
  const combinedRecentBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    [...bookingsWeek, ...bookingsMonth].forEach((b) => map.set(b.id, b));
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsWeek, bookingsMonth]);

  // An imported Airbnb booking that overlapped an existing manual one —
  // flagged, never auto-overwritten (see Booking.conflict's schema
  // comment). Today only a small "⚠️ Conflict" tag on the Bookings page
  // itself; easy to miss unless you're already looking at that exact row.
  const bookingConflicts = useMemo(() => combinedRecentBookings.filter((b) => b.conflict), [combinedRecentBookings]);

  // A unit whose Airbnb calendar sync last failed (Unit.icalLastSyncError
  // is cleared to null on the next successful sync, so this is always
  // "currently broken," never stale history) — today only visible by
  // opening Calendar's Sync History panel.
  const failedSyncUnits = useMemo(() => units.filter((u) => u.icalLastSyncError), [units]);

  // A completed stay whose remaining balance was never marked paid —
  // revenue that's stuck, not currently flagged anywhere.
  const unpaidAfterCheckout = useMemo(
    () => combinedRecentBookings.filter((b) => !b.cancelledAt && isCompletedStay(b) && !b.paid && b.amount > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedRecentBookings]
  );

  // Check-in already happened but the balance is still unpaid — same "⏰
  // Past due" tag now shown on the Bookings page. Excludes stays that have
  // already fully completed (checked out) since those are the more specific,
  // more urgent unpaidAfterCheckout case just above; a booking can't be in
  // both buckets at once. Also excludes cancelled bookings — a cancelled
  // stay was never going to check in, so an unpaid balance on it isn't
  // "past due," it's just moot (real bug: a cancelled-with-only-a-
  // downpayment booking was showing up here indefinitely since neither
  // filter checked cancelledAt at all).
  const pastDueBookings = useMemo(
    () => combinedRecentBookings.filter((b) => !b.cancelledAt && !isCompletedStay(b) && !b.paid && b.amount > 0 && dayOf(new Date(b.date)) < todayIso),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedRecentBookings]
  );

  // Late cleaning — a unit whose most recent checkout hasn't been cleaned
  // yet AND already has a future guest booked in, so whoever arrives next
  // is the one who'll notice if it slips. Checked against cleanedBookingIds
  // (not the coarse HousekeepingUnitState.status alone) — same rule the
  // Housekeeping page itself uses, since a same-day second checkout can
  // leave status reading "clean" from an earlier, already-finished one.
  // "Not yet started" excludes status "cleaning" — staff already on it
  // isn't late, just in progress.
  const lateCleaningUnits = useMemo(() => {
    const now = Date.now();
    const results: { unit: Unit; checkoutAt: Date; nextCheckInAt: Date }[] = [];
    for (const unit of units) {
      const unitBookings = bookingsWeek.filter((b) => b.unitId === unit.id);
      const hk = hkStates.find((h) => h.unitId === unit.id);
      const cleanedIds = hk?.cleanedBookingIds ?? [];
      const pendingCheckout = unitBookings
        .filter((b) => new Date(b.checkOutDate ?? b.date).getTime() <= now && !cleanedIds.includes(b.id))
        .sort((a, b) => +new Date(a.checkOutDate ?? a.date) - +new Date(b.checkOutDate ?? b.date))[0];
      if (!pendingCheckout || hk?.status === "cleaning") continue;
      const nextCheckIn = unitBookings
        .filter((b) => new Date(b.date).getTime() > now)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
      if (!nextCheckIn) continue;
      results.push({ unit, checkoutAt: new Date(pendingCheckout.checkOutDate ?? pendingCheckout.date), nextCheckInAt: new Date(nextCheckIn.date) });
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, bookingsWeek, hkStates]);

  // Dashboard booking reads never include the `unit` relation (see
  // dashboard/page.tsx) — every place that needs a unit name off a booking
  // resolves it through the separately-fetched `units` array instead.
  const unitShortName = (unitId: string) => units.find((u) => u.id === unitId)?.shortName ?? "Unit";

  return useMemo(() => {
    const items: { id: string; dot: string; title: string; desc: string; tag: string; href?: string }[] = [];

    // Auditor findings first — a real, human-flagged quality/safety concern
    // outranks the automated checks below.
    attentionFindings.forEach((f) => {
      items.push({
        id: f.id,
        dot: f.severity === "Critical" ? "bg-rausch" : f.severity === "Warning" ? "bg-amber" : "bg-blue",
        title: f.title,
        desc: f.notes || f.recommendedAction || `${f.unit?.shortName ?? "All units"}${f.employee ? ` · ${f.employee.name}` : ""}`,
        tag: "Auditor",
        href: "/auditor",
      });
    });

    // Upcoming check-in risk outranks the general battery items below — a
    // guest arriving within 48h at a Low/Critical/offline unit is the one
    // scenario that actually needs same-day action, not just "worth knowing."
    if (upcomingCheckinRiskUnits.length > 0) {
      upcomingCheckinRiskUnits.forEach((r) => {
        const hoursOut = Math.round((r.nextCheckInAt.getTime() - Date.now()) / 3600000);
        const when = hoursOut <= 24 ? "within 24 hours" : "within 48 hours";
        const batteryText = r.tier === "offline" ? "isn't reporting (offline)" : `is ${r.tier === "critical" ? "critically" : ""} low (${r.unit.ttlockBatteryPct}%)`;
        items.push({
          id: `attn-checkin-risk-${r.unit.id}`,
          dot: "bg-rausch",
          title: `Upcoming check-in risk — ${formatUnitDisplay(r.unit.unitNumber, r.unit.name)}`,
          desc: `A guest is arriving ${when} and this unit's lock ${batteryText}. Replace the battery or check its connection before they arrive.`,
          tag: "Locks",
          href: "/admin?tab=Units",
        });
      });
    }

    if (batteryStats.critical > 0) {
      const names = lockedUnits.filter((u) => batteryTier(u.ttlockBatteryPct) === "critical").map((u) => `${u.shortName} (${u.ttlockBatteryPct}%)`).join(", ");
      items.push({
        id: "attn-battery-critical",
        dot: "bg-rausch",
        title: `${batteryStats.critical} lock${batteryStats.critical === 1 ? "" : "s"} at critical battery`,
        desc: `${names} — replace immediately before the next guest arrives.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (batteryStats.low > 0) {
      const names = lockedUnits.filter((u) => batteryTier(u.ttlockBatteryPct) === "low").map((u) => `${u.shortName} (${u.ttlockBatteryPct}%)`).join(", ");
      items.push({
        id: "attn-battery-low",
        dot: "bg-amber",
        title: `${batteryStats.low} lock${batteryStats.low === 1 ? "" : "s"} running low on battery`,
        desc: `${names} — schedule a replacement soon.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (batteryStats.offline > 0) {
      const names = lockedUnits.filter((u) => u.ttlockHasGateway === false).map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-battery-offline",
        dot: "bg-amber",
        title: `${batteryStats.offline} lock${batteryStats.offline === 1 ? "" : "s"} not reporting`,
        desc: `${names} — check the lock's WiFi/gateway connection; battery status may be stale.`,
        tag: "Locks",
        href: "/admin?tab=Units",
      });
    }

    if (reserveCodeStats.exhaustedUnits.length > 0) {
      const desc = reserveCodeStats.exhaustedUnits.map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-reserve-codes-exhausted",
        dot: "bg-rausch",
        title: `No emergency access codes left for ${reserveCodeStats.exhaustedUnits.length === 1 ? "1 unit" : `${reserveCodeStats.exhaustedUnits.length} units`}`,
        desc: `${desc} — a TTLock outage during a booking right now would leave that guest without a door code. Release codes from finished stays or provision more.`,
        tag: "Locks",
      });
    }

    // Guest requests from the Digital Guidebook (housekeeping, late
    // checkout, extend stay, a reported issue) — time-sensitive, since a
    // guest is actively waiting on these, so each shows individually
    // rather than being rolled into one summary row like the checks below.
    const GUEST_REQUEST_LABEL: Record<string, string> = {
      housekeeping: "🧹 Housekeeping requested",
      late_checkout: "⏰ Late checkout requested",
      extend_stay: "📅 Stay extension requested",
      issue: "⚠️ Issue reported",
      other: "Guest request",
    };
    const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    [...pendingGuestRequests]
      .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2))
      .forEach((r) => {
        const dot = r.priority === "urgent" ? "bg-rausch" : r.priority === "high" ? "bg-amber" : r.type === "issue" ? "bg-rausch" : "bg-blue";
        const priorityTag = r.priority === "urgent" ? "🔴 Urgent — " : r.priority === "high" ? "🟠 High priority — " : "";
        items.push({
          id: `guest-request-${r.id}`,
          dot,
          title: `${priorityTag}${GUEST_REQUEST_LABEL[r.type] ?? "Guest request"}`,
          desc: `${r.unit?.shortName ?? "Unit"} — ${r.guest?.name ?? r.guest?.email ?? "Guest"}${r.message ? `: "${r.message}"` : ""}${r.photoUrl ? " 📷 Photo attached" : ""}`,
          tag: "Guest",
        });
      });

    if (pendingExpenseRequests.length > 0) {
      const total = pendingExpenseRequests.reduce((s, e) => s + e.amount, 0);
      const desc = pendingExpenseRequests
        .map((e) => `${e.employee?.name ?? "Unknown"} — ${e.category === "TIKTOK_ADS" ? "TikTok Ads" : "Unit Expense"} (${peso(e.amount)})`)
        .join(", ");
      items.push({
        id: "attn-expense-requests",
        dot: "bg-amber",
        title: `${pendingExpenseRequests.length} expense request${pendingExpenseRequests.length === 1 ? "" : "s"} awaiting approval`,
        desc: `${peso(total)} total: ${desc}.`,
        tag: "Expenses",
        href: "/earnings",
      });
    }

    if (quickCleans.length > 0) {
      const desc = quickCleans
        .map((c) => `${c.employee?.name ?? "Unassigned"} — ${unitShortName(c.unitId)} (${c.minutes === 0 ? "instant" : `${c.minutes} min`})`)
        .join(", ");
      items.push({
        id: "attn-quick-cleans",
        dot: "bg-rausch",
        title: `${quickCleans.length} clean${quickCleans.length === 1 ? "" : "s"} marked done unusually fast`,
        desc: `Started and marked clean within 10 minutes — worth a second look: ${desc}.`,
        tag: "Housekeeping",
        href: "/housekeeping",
      });
    }

    if (lateCleaningUnits.length > 0) {
      const desc = lateCleaningUnits
        .map((u) => `${u.unit.shortName} — checked out ${fmtDate(u.checkoutAt, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}, next guest ${fmtDate(u.nextCheckInAt, { month: "short", day: "numeric", timeZone: "Asia/Manila" })}`)
        .join("; ");
      items.push({
        id: "attn-late-cleaning",
        dot: "bg-rausch",
        title: `${lateCleaningUnits.length} unit${lateCleaningUnits.length === 1 ? "" : "s"} ${lateCleaningUnits.length === 1 ? "needs" : "need"} cleaning before the next guest`,
        desc,
        tag: "Housekeeping",
        href: "/housekeeping",
      });
    }

    if (bookingConflicts.length > 0) {
      const desc = bookingConflicts
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-conflicts",
        dot: "bg-rausch",
        title: `${bookingConflicts.length} booking conflict${bookingConflicts.length === 1 ? "" : "s"} need${bookingConflicts.length === 1 ? "s" : ""} review`,
        desc: `An imported Airbnb booking overlaps an existing one: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (pastDueBookings.length > 0) {
      const total = pastDueBookings.reduce((s, b) => s + b.amount, 0);
      const desc = pastDueBookings
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-pastdue",
        dot: "bg-amber",
        title: `${peso(total)} past due — check-in already passed`,
        desc: `Balance still unpaid: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (unpaidAfterCheckout.length > 0) {
      const total = unpaidAfterCheckout.reduce((s, b) => s + b.amount, 0);
      const desc = unpaidAfterCheckout
        .map((b) => `${unitShortName(b.unitId)} (${fmtDate(b.date, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})`)
        .join(", ");
      items.push({
        id: "attn-unpaid",
        dot: "bg-amber",
        title: `${peso(total)} unpaid after checkout`,
        desc: `Stay finished but the balance was never marked paid: ${desc}.`,
        tag: "Bookings",
        href: "/bookings",
      });
    }

    if (failedSyncUnits.length > 0) {
      const desc = failedSyncUnits.map((u) => u.shortName).join(", ");
      items.push({
        id: "attn-sync",
        dot: "bg-amber",
        title: `${failedSyncUnits.length} unit${failedSyncUnits.length === 1 ? "" : "s"} failed to sync with Airbnb`,
        desc: `${desc}. Retry the sync from the Calendar page.`,
        tag: "Calendar",
        href: "/calendar",
      });
    }

    if (overdueBillsForAttention.length > 0) {
      const totalCentavos = overdueBillsForAttention.reduce((s, b) => s + billCentavos(b), 0);
      const desc = overdueBillsForAttention
        .map((b) => {
          const d = dueDateFor(b);
          return `${billMeta(b).label}${d ? ` (${fmtDate(d, { month: "short", day: "numeric", timeZone: "Asia/Manila" })})` : ""}`;
        })
        .join(", ");
      items.push({ id: "attn-bills", dot: "bg-rausch", title: `${pesoCentavos(totalCentavos)} in overdue bills`, desc: `${desc}. See Upcoming expenses below.`, tag: "Expenses" });
    }

    if (lowStock.length > 0) {
      items.push({ id: "attn-stock", dot: "bg-amber", title: "Supplies below minimum", desc: `${lowStock.map((s) => s.name).join(", ")} need restocking.`, tag: "Stock", href: "/housekeeping" });
    }

    return items
      .map((item) => ({ ...item, key: attentionKey(item.id, item.desc) }))
      .filter((item) => !dismissedKeys.has(item.key))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lateCleaningUnits, attentionFindings, overdueBillsForAttention, lowStock, bookingConflicts, pastDueBookings, unpaidAfterCheckout, failedSyncUnits, pendingExpenseRequests, quickCleans, pendingGuestRequests, reserveCodeStats, upcomingCheckinRiskUnits, batteryStats, lockedUnits, dismissedKeys]);
}
