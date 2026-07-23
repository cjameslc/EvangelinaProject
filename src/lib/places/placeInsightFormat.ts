// Pure, client-safe formatting for PlaceInsight data — no prisma import,
// so client components (PlaceInsightRow) can import this directly without
// pulling prisma/@libsql into the browser bundle (same split as
// feedbackContent.ts vs feedbackService.ts).

/** "850 m away" / "1.4 km away" — the only place this formatting happens. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

/** Picks today's line out of Google's weekday_text (requested with
 * language=en, so this is a reliable "Monday:"-style prefix match) —
 * evaluated on the Asia/Manila calendar day, same convention as the rest
 * of the app's date handling. Returns null if the day can't be matched
 * (never fabricates a fallback line). */
export function todaysHoursLine(openingHours: string[] | null, now: Date = new Date()): string | null {
  if (!openingHours || openingHours.length === 0) return null;
  const todayName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "long" }).format(now);
  const line = openingHours.find((l) => l.startsWith(`${todayName}:`));
  return line ? line.slice(todayName.length + 1).trim() : null;
}
