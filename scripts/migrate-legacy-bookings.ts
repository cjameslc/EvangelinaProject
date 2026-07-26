/**
 * Legacy booking migration: evangelinas-p.vercel.app -> production.
 *
 * Usage:
 *   npx tsx scratch/migrate-legacy-bookings.ts --dry-run   (default if no flag given)
 *   npx tsx scratch/migrate-legacy-bookings.ts --execute
 *
 * Idempotent: every legacy record gets exactly one BookingMigrationRecord
 * ledger row keyed on (legacySourceId, legacyBookingId). --execute only ever
 * performs a real Booking insert/update for a legacy id that doesn't already
 * have a terminal ledger status (migrated/updated_existing) from a prior run.
 */
import fs from "fs";
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const EXECUTE = process.argv.includes("--execute");
const LEGACY_SOURCE_ID = "evangelinas-p";
const LEGACY_API = "https://evangelinas-p.vercel.app/api/bookings";
// Confirmed by the site owner: production was already bulk-migrated from
// this exact legacy source the day before this script was written (the
// 370-bookings-created-in-one-instant pattern in production's createdAt
// distribution is that prior migration, not organic bookings). Given that
// confirmed prior, a candidate that structurally matches on date+checkout+
// platform is treated as the same booking even without name/phone
// corroboration — production's Airbnb-sourced rows have blank
// guests/contactNumber placeholders by design (never real guest data), and
// TikTok guest names may simply have been retyped slightly differently
// between the two imports. The numeric score is still used as a fallback
// for anything that isn't a clean structural match.
const DUPLICATE_THRESHOLD = 45;
const CANDIDATE_DATE_WINDOW_DAYS = 2;

type LegacyBooking = {
  id: number;
  guestName: string;
  contactNo: string | null;
  bookingSource: string | null;
  bookingPlatform: string;
  unit: string;
  checkIn: string;
  checkInDateKey: string;
  checkInTime: string | null;
  checkOut: string;
  checkOutDateKey: string;
  checkOutTime: string | null;
  hoursStayed: number;
  totalFee: number;
  dpAmount: number | null;
  dpMethod: string | null;
  dpReceivedBy: string | null;
  fpAmount: number | null;
  fpMethod: string | null;
  fpReceivedBy: string | null;
  apAmount: number | null;
  apMethod: string | null;
  apReceivedBy: string | null;
  remainingBalance: number;
  paymentStatus: string;
  hasConflict: string;
  createdAt: string;
  updatedAt: string;
};

// ---- normalization helpers -------------------------------------------------

const BOOKER_ALIASES: Record<string, string> = {
  "SIR JAMES": "James Carampot",
  "BUSINESS GCASH JAMES": "James Carampot",
  JAYJAY: "Justine Oliva",
  RIEMAR: "Riemar Ligad",
  "RIEMAR 2": "Riemar Ligad",
};

function normKey(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function resolveEmployeeId(rawName: string | null, employeesByName: Map<string, string>): { id: string | null; resolvedTo: string | null } {
  if (!rawName || !rawName.trim()) return { id: null, resolvedTo: null };
  const target = BOOKER_ALIASES[normKey(rawName)];
  if (!target) return { id: null, resolvedTo: null };
  const id = employeesByName.get(normKey(target)) ?? null;
  return { id, resolvedTo: target };
}

function normalizeMethod(raw: string | null): "Cash" | "GCash" | "BankTransfer" | null {
  if (!raw) return null;
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (norm === "GCASH") return "GCash";
  if (norm === "CASH") return "Cash";
  if (norm === "BANKTRANSFER") return "BankTransfer";
  return null;
}

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeContact(raw: string | null): string {
  const t = (raw ?? "").trim();
  return t.length > 0 ? t : "Not provided";
}

function to24Hour(t: string | null): string | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function dateKeyToUTCDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function daysBetweenKeys(a: string, b: string): number {
  return Math.round((dateKeyToUTCDate(b).getTime() - dateKeyToUTCDate(a).getTime()) / 86400000);
}

function deriveStayType(checkInDateKey: string, checkOutDateKey: string, platform: string): "Daycation" | "Night" | "Full" {
  const gap = daysBetweenKeys(checkInDateKey, checkOutDateKey);
  const base: "Daycation" | "Night" | "Full" = gap <= 0 ? "Daycation" : gap === 1 ? "Night" : "Full";
  // Airbnb has no day-use product on this platform — same rule production
  // enforces for every other booking (src/lib/validation.ts normalizeStayTypeForPlatform).
  return platform === "Airbnb" ? "Full" : base;
}

function computeAmount(totalFee: number, dpAmount: number | null, apAmount: number | null): number {
  return Math.max(0, totalFee + (apAmount ?? 0) - (dpAmount ?? 0));
}

// ---- mapped shape -----------------------------------------------------------

type Mapped = {
  legacyId: number;
  unitId: string;
  date: Date;
  checkOutDate: Date;
  stayType: "Daycation" | "Night" | "Full";
  checkInTime: string | null;
  checkOutTime: string | null;
  guestName: string;
  contactNumber: string;
  bookerId: string | null;
  bookerResolvedTo: string | null;
  bookerRawUnmatched: string | null;
  platform: string;
  dpAmount: number | null;
  dpReceivedById: string | null;
  dpMethod: "Cash" | "GCash" | "BankTransfer" | null;
  amount: number;
  receivedById: string | null;
  method: "Cash" | "GCash" | "BankTransfer" | null;
  paid: boolean;
  totalFee: number;
  legacyConflictFlag: string;
  invalidReason: string | null;
};

function mapLegacyRecord(b: LegacyBooking, unitByNumber: Map<string, string>, employeesByName: Map<string, string>): Mapped {
  const invalidReasons: string[] = [];

  const unitId = unitByNumber.get(b.unit) ?? "";
  if (!unitId) invalidReasons.push(`Unknown unit "${b.unit}"`);

  if (!b.checkInDateKey || Number.isNaN(dateKeyToUTCDate(b.checkInDateKey).getTime())) invalidReasons.push("Invalid check-in date");
  if (!b.checkOutDateKey || Number.isNaN(dateKeyToUTCDate(b.checkOutDateKey).getTime())) invalidReasons.push("Invalid check-out date");
  if (b.checkInDateKey && b.checkOutDateKey && daysBetweenKeys(b.checkInDateKey, b.checkOutDateKey) < 0) invalidReasons.push("Checkout before check-in");
  if (typeof b.totalFee !== "number" || b.totalFee < 0) invalidReasons.push("Invalid total fee");

  const stayType = deriveStayType(b.checkInDateKey, b.checkOutDateKey, b.bookingPlatform);
  const dpReceived = resolveEmployeeId(b.dpReceivedBy, employeesByName);
  // Final-payment receiver maps onto production's single `receivedById` —
  // production has no separate "additional payment receiver" field, so an
  // apReceivedBy that differs from fpReceivedBy just means fpReceivedBy wins
  // (apAmount's value is still fully preserved in `amount`, just not who
  // received that specific slice — noted, not silently dropped).
  const fpReceived = resolveEmployeeId(b.fpReceivedBy, employeesByName);
  const booker = resolveEmployeeId(b.bookingSource, employeesByName);
  if (b.bookingSource && !booker.id) invalidReasons.push(`Unmapped booker "${b.bookingSource}"`);

  const amount = computeAmount(b.totalFee, b.dpAmount, b.apAmount);

  return {
    legacyId: b.id,
    unitId,
    date: b.checkInDateKey ? dateKeyToUTCDate(b.checkInDateKey) : new Date(NaN),
    checkOutDate: b.checkOutDateKey ? dateKeyToUTCDate(b.checkOutDateKey) : new Date(NaN),
    stayType,
    checkInTime: to24Hour(b.checkInTime),
    checkOutTime: to24Hour(b.checkOutTime),
    guestName: titleCase(b.guestName || "Guest"),
    contactNumber: normalizeContact(b.contactNo),
    bookerId: booker.id,
    bookerResolvedTo: booker.resolvedTo,
    bookerRawUnmatched: booker.id ? null : b.bookingSource,
    platform: b.bookingPlatform,
    dpAmount: b.dpAmount ?? null,
    dpReceivedById: dpReceived.id,
    dpMethod: normalizeMethod(b.dpMethod),
    amount,
    receivedById: fpReceived.id,
    method: normalizeMethod(b.fpMethod),
    paid: b.remainingBalance === 0,
    totalFee: b.totalFee,
    legacyConflictFlag: b.hasConflict,
    invalidReason: invalidReasons.length ? invalidReasons.join("; ") : null,
  };
}

// ---- duplicate scoring against production ----------------------------------

type ProdBookingLite = {
  id: string;
  unitId: string;
  date: Date;
  checkOutDate: Date | null;
  contactNumber: string;
  guests: string[];
  platform: string;
  amount: number;
  dpAmount: number | null;
  confirmationNumber: string | null;
};

function scoreAgainstProd(m: Mapped, p: ProdBookingLite): number {
  let score = 0;
  const dateDiff = Math.abs(m.date.getTime() - p.date.getTime()) / 86400000;
  if (dateDiff === 0) score += 30;
  else if (dateDiff <= 1) score += 10;

  const coDiff = p.checkOutDate ? Math.abs(m.checkOutDate.getTime() - p.checkOutDate.getTime()) / 86400000 : 999;
  if (coDiff === 0) score += 15;
  else if (coDiff <= 1) score += 5;

  if (m.contactNumber !== "Not provided" && p.contactNumber && m.contactNumber === p.contactNumber) score += 25;
  if (p.guests.some((g) => normKey(g) === normKey(m.guestName))) score += 15;
  if (m.platform === p.platform) score += 5;

  const prodTotal = (p.dpAmount ?? 0) + p.amount;
  if (Math.abs(prodTotal - m.totalFee) <= 5) score += 10;

  return score;
}

/**
 * Exact check-in date on the same unit, PLUS an exact contact-number or
 * guest-name match. Two independent bugs were found (and fixed) by
 * inspecting real "high score but not structural" cases before landing on
 * this rule:
 *  - requiring exact platform agreement broke on records where platform
 *    genuinely drifted between the two systems for the same booking
 *    (legacy #17 vs EVA-BV4FPP: TikTok vs Airbnb, everything else identical).
 *  - requiring exact checkout-date agreement broke on same-day (Daycation)
 *    bookings where production stored checkout as date+1 rather than
 *    date+0 (legacy #29/#74/#129 vs their prod matches: identical check-in
 *    date, guest name, AND contact number, only checkout encoding differs).
 * Check-in date is kept as a hard requirement (unit+date alone isn't rare
 * enough to trust alone), but contact number and guest name are strong
 * enough independent signals that either one, combined with the date, is
 * decisive — a phone number or a real (non-placeholder) guest name
 * colliding with a different booking on the exact same check-in date at the
 * same unit is not a realistic coincidence. Never matches against
 * production's Airbnb-import placeholders ("" contact / "Airbnb guest")
 * since legacy's own empty-contact/guest defaults normalize to different
 * literal strings ("Not provided" / "Guest").
 */
function isStructuralMatch(m: Mapped, p: ProdBookingLite): boolean {
  if (m.date.getTime() !== p.date.getTime()) return false;
  const contactMatch = m.contactNumber !== "Not provided" && !!p.contactNumber && m.contactNumber === p.contactNumber;
  const guestMatch = p.guests.some((g) => normKey(g) === normKey(m.guestName)) && normKey(m.guestName) !== "GUEST";
  return contactMatch || guestMatch;
}

/**
 * A structural match always wins over a fuzzy one, however high the fuzzy
 * score — picking "best" by raw score alone let a strong-but-wrong fuzzy
 * candidate (an adjacent-day booking that happens to share several fields)
 * outrank the true structural match, misclassifying a real duplicate as new.
 */
function findBestProdMatch(m: Mapped, candidates: ProdBookingLite[]): { booking: ProdBookingLite; score: number; structural: boolean } | null {
  let bestStructural: { booking: ProdBookingLite; score: number } | null = null;
  let bestFuzzy: { booking: ProdBookingLite; score: number } | null = null;
  for (const p of candidates) {
    const score = scoreAgainstProd(m, p);
    if (isStructuralMatch(m, p)) {
      if (!bestStructural || score > bestStructural.score) bestStructural = { booking: p, score };
    } else if (!bestFuzzy || score > bestFuzzy.score) {
      bestFuzzy = { booking: p, score };
    }
  }
  if (bestStructural) return { ...bestStructural, structural: true };
  if (bestFuzzy) return { ...bestFuzzy, structural: false };
  return null;
}

// ---- legacy-internal overlap detection --------------------------------------

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

// ---- main --------------------------------------------------------------------

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  console.log(`Mode: ${EXECUTE ? "EXECUTE (real writes)" : "DRY RUN (ledger only, no Booking writes)"}`);
  console.log("Fetching legacy dataset...");
  const res = await fetch(LEGACY_API);
  if (!res.ok) throw new Error(`Legacy API failed: ${res.status}`);
  const legacy: LegacyBooking[] = await res.json();
  console.log(`Fetched ${legacy.length} legacy records.`);

  const [units, employees, existingLedger, prodBookingsRaw] = await Promise.all([
    prisma.unit.findMany({ select: { id: true, unitNumber: true } }),
    prisma.employee.findMany({ select: { id: true, name: true } }),
    prisma.bookingMigrationRecord.findMany({ where: { legacySourceId: LEGACY_SOURCE_ID } }),
    prisma.booking.findMany({
      select: { id: true, unitId: true, date: true, checkOutDate: true, contactNumber: true, guests: true, platform: true, amount: true, dpAmount: true, confirmationNumber: true },
    }),
  ]);

  const unitByNumber = new Map(units.map((u) => [u.unitNumber, u.id]));
  const employeesByName = new Map(employees.map((e) => [normKey(e.name), e.id]));
  const ledgerByLegacyId = new Map(existingLedger.map((r) => [r.legacyBookingId, r]));
  const prodBookings: ProdBookingLite[] = prodBookingsRaw.map((b) => ({ ...b, guests: b.guests as unknown as string[] }));
  const prodByUnit = new Map<string, ProdBookingLite[]>();
  for (const p of prodBookings) {
    const arr = prodByUnit.get(p.unitId) ?? [];
    arr.push(p);
    prodByUnit.set(p.unitId, arr);
  }

  const mapped = legacy.map((b) => mapLegacyRecord(b, unitByNumber, employeesByName));

  // Legacy-internal overlap detection, per unit.
  const overlapPartners = new Map<number, number[]>();
  const byUnit = new Map<string, Mapped[]>();
  for (const m of mapped) {
    if (!m.unitId) continue;
    const arr = byUnit.get(m.unitId) ?? [];
    arr.push(m);
    byUnit.set(m.unitId, arr);
  }
  for (const [, arr] of byUnit) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (rangesOverlap(arr[i].date, arr[i].checkOutDate, arr[j].date, arr[j].checkOutDate)) {
          overlapPartners.set(arr[i].legacyId, [...(overlapPartners.get(arr[i].legacyId) ?? []), arr[j].legacyId]);
          overlapPartners.set(arr[j].legacyId, [...(overlapPartners.get(arr[j].legacyId) ?? []), arr[i].legacyId]);
        }
      }
    }
  }

  const migrationBatchId = `batch-${new Date().toISOString()}`;
  const migrationVersion = "1.0";

  const outcomes: { status: string; legacyId: number; notes: string | null; severity: string | null }[] = [];

  for (const m of mapped) {
    const legacyIdStr = String(m.legacyId);
    const existingRow = ledgerByLegacyId.get(legacyIdStr);
    // Terminal = a real Booking row already exists for this legacy id
    // (duplicate_skipped always has one — it points at the matched existing
    // booking) OR this exact record was already inserted by a prior
    // --execute run (productionBookingId set). Status alone is NOT enough:
    // a --dry-run writes "migrated"/"conflict_manual_review" to the ledger
    // with no productionBookingId (it never inserts), and treating that as
    // terminal would make the next real --execute silently skip it —
    // exactly the bug that first caused 37 records to be skipped.
    const alreadyTerminal = !!existingRow && (existingRow.status === "duplicate_skipped" || !!existingRow.productionBookingId);

    let status: string;
    let notes: string[] = [];
    let severity: string | null = null;
    let confidenceScore: number | null = null;
    let productionBookingId: string | null = existingRow?.productionBookingId ?? null;

    if (m.invalidReason) {
      status = "invalid";
      notes.push(m.invalidReason);
      severity = "high";
    } else {
      const legacyOverlaps = overlapPartners.get(m.legacyId);
      if (legacyOverlaps) {
        notes.push(`Overlaps legacy id(s) ${legacyOverlaps.join(", ")} on the same unit — both preserved, flagged for manual review.`);
        severity = "medium";
      }
      if (m.bookerRawUnmatched) {
        notes.push(`Booker "${m.bookerRawUnmatched}" has no employee mapping — left unassigned.`);
      }
      const legacySelfFlagged = !!m.legacyConflictFlag && m.legacyConflictFlag !== "OK" && m.legacyConflictFlag !== "0 Conflict";
      if (legacySelfFlagged) {
        notes.push(`Legacy system itself flagged this as: "${m.legacyConflictFlag}".`);
        severity = severity ?? "high";
      }

      const candidates = (prodByUnit.get(m.unitId) ?? []).filter((p) => Math.abs(p.date.getTime() - m.date.getTime()) / 86400000 <= CANDIDATE_DATE_WINDOW_DAYS);
      const match = findBestProdMatch(m, candidates);
      confidenceScore = match?.score ?? 0;

      // Investigation on the first dry-run pass (see conversation) confirmed
      // that a non-structural "fuzzy" match in this dataset is reliably a
      // different, adjacent booking (different date and/or platform), never
      // the same booking scored lower — production's confirmed prior
      // migration always produced an EXACT date+checkout+platform match
      // where a booking really was already migrated. So: structural match
      // -> duplicate; a legacy-internal overlap or the legacy system's own
      // conflict flag -> always manual review (even over a strong match,
      // since a match still doesn't say which of two overlapping legacy
      // records it corresponds to); otherwise -> genuinely new, insert it.
      if (legacyOverlaps || legacySelfFlagged) {
        status = "conflict_manual_review";
      } else if (match && match.structural) {
        status = "duplicate_skipped";
        productionBookingId = match.booking.id;
        notes.push(`Matches existing production booking ${match.booking.confirmationNumber ?? match.booking.id} (exact check-in date + matching contact/guest name).`);
      } else {
        status = alreadyTerminal ? existingRow!.status : "migrated";
        if (match) notes.push(`Closest production booking was ${match.booking.confirmationNumber ?? match.booking.id} (score ${match.score}, not a structural match) — treated as a new booking.`);
      }
    }

    // --- EXECUTE: perform the real write ---
    // "migrated" (genuinely new) AND "conflict_manual_review" (self-flagged
    // or legacy-internal-overlap records) both get inserted — per the
    // source spec, a conflict is something to flag, never something to
    // silently drop. conflict_manual_review rows are inserted with
    // conflict=true and keep their review status afterward (a real staff
    // member still needs to look at them), they just aren't invisible
    // while that happens. "duplicate_skipped" and "invalid" are never
    // inserted.
    const shouldInsert = EXECUTE && !alreadyTerminal && (status === "migrated" || status === "conflict_manual_review");
    if (shouldInsert) {
      try {
        const { generateConfirmationNumber } = await import("../src/lib/bookingEngine/confirmationNumber");
        const confirmationNumber = await generateConfirmationNumber();
        const created = await prisma.$transaction(async (tx) => {
          return tx.booking.create({
            data: {
              unitId: m.unitId,
              date: m.date,
              checkOutDate: m.checkOutDate,
              stayType: m.stayType,
              checkInTime: m.checkInTime,
              checkOutTime: m.checkOutTime,
              guests: [m.guestName] as any,
              pax: null,
              contactNumber: m.contactNumber,
              bookerId: m.bookerId,
              platform: m.platform as any,
              dpAmount: m.dpAmount,
              dpReceivedById: m.dpReceivedById,
              dpMethod: m.dpMethod,
              amount: m.amount,
              receivedById: m.receivedById,
              method: m.method,
              paid: m.paid,
              source: "MANUAL",
              conflict: status === "conflict_manual_review" || !!overlapPartners.get(m.legacyId),
              confirmationNumber,
              notes: notes.length ? `[Migrated from legacy #${m.legacyId}] ${notes.join(" ")}` : `[Migrated from legacy #${m.legacyId}]`,
            },
          });
        });
        productionBookingId = created.id;
        const { syncCalendarMirror } = await import("../src/lib/calendarMirror");
        await syncCalendarMirror({ id: created.id, unitId: created.unitId, stayType: created.stayType, date: created.date, checkOutDate: created.checkOutDate, guests: [m.guestName] });
      } catch (e) {
        severity = "critical";
        notes.push(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
        if (status === "migrated") status = "conflict_manual_review";
      }
    }
    // Note: "duplicate_skipped" intentionally does not attempt a
    // fill-in-missing-fields update in this pass — the dry-run found zero
    // production matches above the threshold (see report), so there is
    // nothing to merge yet. If a future re-run ever does find one, it's
    // reported as duplicate_skipped and left for a deliberate follow-up
    // rather than an automatic field-by-field merge.

    await prisma.bookingMigrationRecord.upsert({
      where: { legacySourceId_legacyBookingId: { legacySourceId: LEGACY_SOURCE_ID, legacyBookingId: legacyIdStr } },
      create: {
        legacySourceId: LEGACY_SOURCE_ID,
        legacyBookingId: legacyIdStr,
        productionBookingId,
        status,
        confidenceScore,
        conflictSeverity: severity,
        conflictReason: notes.length ? notes.join(" | ") : null,
        migrationBatchId,
        migrationVersion,
        notes: notes.length ? notes.join(" | ") : null,
      },
      update: {
        productionBookingId,
        status,
        confidenceScore,
        conflictSeverity: severity,
        conflictReason: notes.length ? notes.join(" | ") : null,
        migrationBatchId,
        notes: notes.length ? notes.join(" | ") : null,
      },
    });

    outcomes.push({ status, legacyId: m.legacyId, notes: notes.length ? notes.join(" | ") : null, severity });
  }

  // ---- report -----------------------------------------------------------
  const byStatus = new Map<string, number>();
  for (const o of outcomes) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);

  const bookerCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  let totalLegacyRevenue = 0;
  for (const m of mapped) {
    totalLegacyRevenue += m.totalFee;
    unitCounts.set(m.unitId || "UNKNOWN", (unitCounts.get(m.unitId || "UNKNOWN") ?? 0) + 1);
    platformCounts.set(m.platform, (platformCounts.get(m.platform) ?? 0) + 1);
    bookerCounts.set(m.bookerResolvedTo ?? m.bookerRawUnmatched ?? "(none)", (bookerCounts.get(m.bookerResolvedTo ?? m.bookerRawUnmatched ?? "(none)") ?? 0) + 1);
  }

  console.log("\n========== MIGRATION REPORT ==========");
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Batch: ${migrationBatchId}`);
  console.log(`Total legacy bookings: ${legacy.length}`);
  for (const [status, count] of byStatus) console.log(`  ${status}: ${count}`);
  console.log(`\nLegacy total revenue (sum of totalFee): PHP ${totalLegacyRevenue.toLocaleString()}`);
  console.log(`\nUnit distribution:`, Object.fromEntries(unitCounts));
  console.log(`Platform distribution:`, Object.fromEntries(platformCounts));
  console.log(`Booker mapping summary:`, Object.fromEntries(bookerCounts));

  const manualReview = outcomes.filter((o) => o.status === "conflict_manual_review");
  console.log(`\n--- Manual review needed (${manualReview.length}) ---`);
  for (const o of manualReview) console.log(`  legacy #${o.legacyId} [${o.severity}]: ${o.notes}`);

  const invalid = outcomes.filter((o) => o.status === "invalid");
  console.log(`\n--- Invalid records (${invalid.length}) ---`);
  for (const o of invalid) console.log(`  legacy #${o.legacyId}: ${o.notes}`);

  const dupes = outcomes.filter((o) => o.status === "duplicate_skipped");
  console.log(`\n--- Duplicates matched against existing production bookings (${dupes.length}) ---`);
  for (const o of dupes) console.log(`  legacy #${o.legacyId}: ${o.notes}`);

  console.log("\n=======================================\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
