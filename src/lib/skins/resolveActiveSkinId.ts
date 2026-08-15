// Pure resolution logic for "which skin is active right now" — the one
// place the Manual > Scheduled > Default priority order (brief section 16)
// lives. Deliberately has zero knowledge of bookings, payments,
// availability, permissions, or any other business rule: it takes a
// manual-override id and today's date, and returns a skin id. Nothing
// else. This is what keeps the skin layer unable to ever affect business
// logic, no matter how many skins get added later.
import { SKIN_LIST } from "./config";
import type { SkinId, SkinSchedule } from "./types";

/** True if month/day falls within a schedule window, correctly handling a
 * window that wraps across the year boundary (e.g. New Year's Dec 31 -> Jan 2). */
export function isWithinSchedule(schedule: SkinSchedule, month: number, day: number): boolean {
  if (!schedule) return false;
  const { startMonth, startDay, endMonth, endDay } = schedule;
  const cur = month * 100 + day;
  const start = startMonth * 100 + startDay;
  const end = endMonth * 100 + endDay;
  if (start <= end) return cur >= start && cur <= end;
  // Wraps the year boundary (start after end numerically, e.g. Dec -> Jan).
  return cur >= start || cur <= end;
}

/**
 * Manual override (an admin explicitly picked a skin) always wins. With no
 * override, the first configured skin whose schedule matches today's
 * month/day activates automatically. With neither, Evangelina Violet — the
 * permanent default — applies. Registry order breaks any tie between two
 * simultaneously-scheduled skins (shouldn't normally happen with sane
 * schedules, but a deterministic tiebreak beats an arbitrary one).
 */
export function resolveActiveSkinId(manualOverrideId: string | null | undefined, today: { month: number; day: number }): SkinId {
  if (manualOverrideId && SKIN_LIST.some((s) => s.id === manualOverrideId)) {
    return manualOverrideId as SkinId;
  }
  const scheduled = SKIN_LIST.find((s) => isWithinSchedule(s.schedule, today.month, today.day));
  if (scheduled) return scheduled.id;
  return "evangelina";
}

/**
 * Days remaining until a schedule's end date, from `today` — purely
 * decorative (SeasonalAnnouncement's countdown), never used for the actual
 * activation decision above. Returns null for a manual-only skin (no
 * schedule at all — Anniversary/Airbnb Style) or a skin currently active
 * only via manual override outside its own schedule window, matching the
 * brief's "do not show a countdown if no event end date is configured."
 * Handles a schedule that wraps the year boundary (e.g. New Year's Dec 31
 * -> Jan 2) the same way isWithinSchedule does.
 */
export function daysRemainingInSchedule(schedule: SkinSchedule, today: { month: number; day: number; year: number }): number | null {
  if (!schedule || !isWithinSchedule(schedule, today.month, today.day)) return null;
  const { endMonth, endDay, startMonth, startDay } = schedule;
  const wraps = startMonth * 100 + startDay > endMonth * 100 + endDay;
  // If the window wraps (e.g. Dec 31 -> Jan 2) and today is already in the
  // new year's portion (e.g. Jan 1), the end date is this same calendar
  // year; if today is still in the old year's portion (e.g. Dec 31), the
  // end date falls in the *next* calendar year.
  const endYear = wraps && today.month * 100 + today.day >= startMonth * 100 + startDay ? today.year + 1 : today.year;
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  const start = Date.UTC(today.year, today.month - 1, today.day);
  return Math.max(0, Math.round((end - start) / 86400000));
}
