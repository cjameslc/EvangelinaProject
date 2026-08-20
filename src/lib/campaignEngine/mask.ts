// Turns real, internally-computed campaign numbers into what a non-admin
// viewer is actually allowed to receive over the wire. This is the ONLY
// place real profit/revenue figures are allowed to be replaced with a
// teaser string — every function in campaign.ts/profit.ts keeps operating
// on real numbers throughout (ranking, team totals, winner detection, the
// month-end freeze) and is untouched by any of this. The API route calls
// these transforms exactly once, right before building the JSON response,
// so a masked value is never computed from — or reconstructible into — a
// tighter number than what's shown.
//
// Every masking decision here follows one rule: a viewer only ever learns
// as much about someone else's number as the least-precise thing already
// shown about it. The leaderboard bar for a masked row, for instance, is
// computed from the SAME masked-band floor as its teaser text, not the
// real value — a precisely-scaled bar next to an approximate label would
// leak more than the label admits to.
import type { RankedParticipant, TeamBattleSide, WireParticipant, WireTeamBattleSide } from "./types";

/** The real value floored to its own leading-digit band, e.g. 87,450 -> 80,000. Shared by maskPeso (formats it) and the bar-width calculation, so neither ever carries more precision than the other. */
export function maskedBandFloor(value: number): number {
  const v = Math.max(0, Math.floor(value));
  if (v < 10) return v;
  const digits = String(v).length;
  const magnitude = 10 ** (digits - 1);
  return Math.floor(v / magnitude) * magnitude;
}

/**
 * Teaser-formats a real peso amount: keeps the leading digit and overall
 * magnitude, masks the rest — e.g. 87,450 -> "₱8X,XXX+", 65,230 ->
 * "₱6X,XXX+". Narrows the viewer to a band of size 10^(digits-1) rather
 * than the exact figure (for a 5-digit amount, a ₱10,000-wide band) —
 * enough to feel like a real teaser, never enough to read off an exact
 * number.
 */
export function maskPeso(value: number): string {
  const v = Math.max(0, Math.floor(value));
  if (v === 0) return "₱0";
  const s = String(v);
  if (s.length === 1) return `₱${s}+`;
  const maskedDigits = s[0] + "X".repeat(s.length - 1);
  let grouped = "";
  for (let i = 0; i < maskedDigits.length; i++) {
    grouped += maskedDigits[i];
    const posFromRight = maskedDigits.length - i;
    if (posFromRight > 1 && (posFromRight - 1) % 3 === 0) grouped += ",";
  }
  return `₱${grouped}+`;
}

/** True for an admin, or for a participant looking at their own row — not new information either way, since they already know what they personally booked. */
function revealsExactTo(employeeId: string, isAdmin: boolean, viewerEmployeeId: string | null): boolean {
  return isAdmin || employeeId === viewerEmployeeId;
}

/** Bar-fill precision never exceeds what the row's own text already discloses — the real value when it's revealed, the masked-band floor otherwise. maxEffective must be computed from the same rule across the whole list (see toWireRanked). */
function barPctFor(effectiveValue: number, maxEffective: number): number {
  if (maxEffective <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((effectiveValue / maxEffective) * 100)));
}

/** Masks a full ranked list for one viewer, computing bar fills from a consistent precision rule across every row (see module doc comment). Use this instead of mapping toWireParticipant per-row directly, so maxEffective is computed once, correctly, across the whole list. */
export function toWireRanked(ranked: RankedParticipant[], isAdmin: boolean, viewerEmployeeId: string | null): WireParticipant[] {
  const effective = ranked.map((p) => (revealsExactTo(p.employeeId, isAdmin, viewerEmployeeId) ? p.profitPesos : maskedBandFloor(p.profitPesos)));
  const maxEffective = Math.max(0, ...effective);
  return ranked.map((p, i) => {
    const exact = revealsExactTo(p.employeeId, isAdmin, viewerEmployeeId);
    return {
      ...p,
      profitPesos: exact ? p.profitPesos : maskPeso(p.profitPesos),
      revenuePesos: exact ? p.revenuePesos : maskPeso(p.revenuePesos),
      barPct: barPctFor(effective[i], maxEffective),
    };
  });
}

/**
 * Side totals are always an aggregate of multiple people — never "the
 * viewer's own" number, so always masked for a non-admin regardless of
 * who's asking. Member rows within reuse the same per-row reveal rule as
 * toWireRanked.
 *
 * contributionPct needs its own care: the campaign target is public and
 * exact, so an exact "41% of target" is just as much a reveal as the real
 * peso total would be (target × 41% narrows the total to within half a
 * percent). Recomputed from the same masked-band floor as the displayed
 * teaser for a non-admin, so it never carries more precision than the
 * text sitting right next to it.
 */
export function toWireTeamBattleSide(t: TeamBattleSide, isAdmin: boolean, viewerEmployeeId: string | null, targetPesos: number): WireTeamBattleSide {
  const contributionPct = isAdmin || targetPesos <= 0
    ? t.contributionPct
    : Math.round((maskedBandFloor(t.totalProfitPesos) / targetPesos) * 100);
  return {
    side: t.side,
    members: toWireRanked(t.members, isAdmin, viewerEmployeeId),
    totalProfitPesos: isAdmin ? t.totalProfitPesos : maskPeso(t.totalProfitPesos),
    totalRevenuePesos: isAdmin ? t.totalRevenuePesos : maskPeso(t.totalRevenuePesos),
    totalBookings: t.totalBookings,
    avgProfitPerBooker: isAdmin ? t.avgProfitPerBooker : maskPeso(t.avgProfitPerBooker),
    avgProfitPerBooking: isAdmin ? t.avgProfitPerBooking : maskPeso(t.avgProfitPerBooking),
    contributionPct,
  };
}

/** Client-side render helper — a money field is either already a real number (admin/self) or an already-formatted teaser string; either way this is the one place UI components should read it through, never `peso()` directly. */
export function renderMoney(v: number | string): string {
  return typeof v === "number" ? "₱" + Math.round(v).toLocaleString("en-PH") : v;
}
