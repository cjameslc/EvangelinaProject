import { manilaTodayISO } from "@/lib/manilaTime";
import type { StayType } from "@/lib/bookingEngine/availabilityService";

function manilaNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (hour === 24) hour = 0; // some ICU builds report midnight as "24" with hour12:false
  return hour * 60 + minute;
}

const DAYCATION_CUTOFF_MINUTES = 20 * 60; // 8:00 PM
const NIGHT_EARLIEST_MINUTES = 17 * 60; // 5:00 PM

/**
 * Same-day booking window — deliberately not surfaced anywhere in the UI as
 * an explicit rule (per an explicit ask): a request outside the window is
 * just indistinguishable from ordinary unavailability ("Not available for
 * these dates" / a generic conflict), never a message naming the cutoff.
 *
 * Daycation (12hr daytime session) can't be booked for today once it's
 * past 8pm — the day's daytime window is already gone. Night stay (12hr
 * overnight) can't be booked for today before 5pm — a same-day night stay
 * only makes sense from evening onward. Full stay (21hr) and any future
 * date are unrestricted; "until 7am the next day" describes how a Night
 * stay naturally concludes, not an additional cutoff to enforce here.
 */
export function isStayTypeBookableNow(stayType: StayType, dateStr: string): boolean {
  if (dateStr !== manilaTodayISO()) return true;
  const nowMinutes = manilaNowMinutes();
  if (stayType === "Daycation") return nowMinutes < DAYCATION_CUTOFF_MINUTES;
  if (stayType === "Night") return nowMinutes >= NIGHT_EARLIEST_MINUTES;
  return true;
}
