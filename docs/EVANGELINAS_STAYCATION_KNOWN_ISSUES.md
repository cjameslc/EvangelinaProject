# Evangelina's Staycation — Known Issues

Classified per the standard used throughout this audit: **BUG**, **REGRESSION**, **DESIGN ISSUE**, **TEST-DATA ISSUE**, **EXPECTED BEHAVIOR**, **TECHNICAL DEBT**, **SECURITY ISSUE**, **PERFORMANCE ISSUE**. Each entry states its classification, evidence, and current status (Fixed this pass / Deferred, with reason).

---

## Fixed this pass

### 1. `isBookingCompleted()` / `guestJourneyStage()` — real UTC+8 offset bug
**Classification: BUG (severe, universal).**
`getOccupiedWindow()`'s `start`/`end` are Asia/Manila wall-clock placeholders, not real UTC instants (an hour-of-day stamped onto a UTC-labeled day). Both functions compared this placeholder directly against a real `now = new Date()` (every actual caller passes exactly that) with no conversion. Empirically confirmed: a Daycation checking out 8pm Manila (real instant 12:00 UTC) only registered as "completed" once real UTC time reached 20:00 — a full 8 real hours after the guest had actually left. `guestJourneyStage()` had never even received the fix `isBookingCompleted()` was previously given for a related issue.

**Real impact**: Elite Booker Challenge tier crossings delayed up to 8 hours; My Earnings/leaderboard completed-stay counts under-reported at day boundaries; guest feedback ("Feedback opens once your stay is complete") blocked for up to 8 hours after the guest actually left; Guest Portal showed "Stay completed" for a same-day stay's *entire* actual duration (a second, independent bug in `guestJourneyStage` specifically — its day-bucket comparison would have double-applied the timezone conversion if fixed naively).

**Fix**: `src/lib/bookingStatus.ts` — both functions now convert via `manilaWallClockToRealInstant()` before any real-instant comparison, and via the new `nominalCalendarDay()` (independently, not chained after the real-instant conversion — an intermediate draft of this fix got that chaining wrong and was caught before shipping) for day-bucket comparisons. 16 new automated tests in `src/lib/bookingStatus.test.ts`.

### 2. TTLock guest-credential race condition — two live door codes per booking
**Classification: SECURITY ISSUE (confirmed exploited in production, not theoretical).**
`createGuestAccessCode()`'s check-then-act (`findFirst` for an existing ACTIVE credential, then a real TTLock HTTP call, then `create`) had a TOCTOU gap spanning a real external API call — not just a DB round trip. The sibling `HOUSEKEEPING`-type credential path had already been hardened against the identical race with a partial unique index; the `GUEST` type never received the equivalent fix.

**Real impact, confirmed**: querying production found **4 real bookings with duplicate ACTIVE GUEST credentials** (2 or 3 per booking), each pair created 1-3 seconds apart — a live, already-exploited instance of this exact race, not a hypothetical.

**Fix**: cleaned up the 4 real duplicate groups (kept the earliest-created credential per booking, revoked the rest via the existing `revokeCredential()` — which correctly released reserve codes and deleted orphaned TTLock passcodes), then added `access_credentials_active_guest_unique` (a partial unique index on `(type, bookingId) WHERE type='GUEST' AND status='ACTIVE'`, mirroring the existing `HOUSEKEEPING` index), `createGuestAccessCode()` now catches the constraint violation and deletes the orphaned real TTLock passcode. Live-verified: 3 real concurrent inserts against production → exactly 1 succeeded.

### 3. `minutesLate()` / `lateMinutesFor()` — tardiness detection was effectively non-functional
**Classification: BUG (severe — the feature barely worked at all for realistic cases).**
Both hand-duplicated implementations built a "scheduled checkout" timestamp via manual `setUTCHours` (a placeholder, same class as #1) and subtracted it from a *real* `startedAt` timestamp with no conversion. Empirically confirmed: a housekeeper starting a genuine 1 real hour late (well past the 10-minute grace) was reported as perfectly on time — tardiness only registered at all once a housekeeper started **more than 8 real hours late**, and even then under-reported the delay by exactly 8 hours. Separately, the hardcoded `"12:00"` fallback for a missing `checkOutTime` was wrong for Daycation (should default to 20:00).

**Real impact**: the `cleaning.late` staff notification and the Dashboard's "late cleanings" / "average delay" metrics have likely never accurately reflected real tardiness.

**Fix**: centralized into `minutesLateFor()` in `src/lib/stayRange.ts`, using `getOccupiedWindow()` + `manilaWallClockToRealInstant()` correctly. Both call sites (`housekeeping/unit/[id]/route.ts`, `dashboard/housekeeping-ops/route.ts`) now delegate to it. 7 new automated tests.

### 4. Housekeeping's cleaning schedule used the raw `checkOutDate` field
**Classification: BUG (real, not yet reported live).**
`HousekeepingView.tsx`'s Today/Tomorrow/Week schedule bucketed by `(checkOutDate ?? date).slice(0,10)` directly, rather than the real occupied-window engine. `checkOutDate` is staff-editable independently of `checkInTime`/`checkOutTime` (separate pickers, nothing recomputes one from the others) — a Flexible booking set to e.g. 22:00→04:00 without also advancing `checkOutDate` would schedule its cleaning task a full day early.

**Fix**: now uses `getOccupiedWindow()` + `checkoutDisplayDay()`, the same canonical engine Bookings/Calendar use.

### 5. Concurrent "Start Cleaning" race
**Classification: BUG (confirmed reproducible, not yet reported live).**
No precondition check before the `HousekeepingUnitState` upsert — two staff tapping Start within moments of each other both got a 200, with whichever transaction committed second silently overwriting the first's `startedAt`/`byName`.

**Fix**: a fresh in-transaction status read now rejects a second "start" with 409 while the unit is already `"cleaning"`. Live-verified with two genuinely concurrent HTTP requests against production: exactly one succeeded, the other correctly received 409.

---

## Deferred — documented, not fixed this pass

### 6. Booking PATCH — no optimistic concurrency (last-write-wins on shared fields)
**Classification: DESIGN ISSUE / TECHNICAL DEBT.**
Two staff editing the same booking's same field concurrently resolve silently, last-write-wins — no version/`updatedAt` check. **Not fixed this pass**: adding real optimistic-concurrency control (a version field, migration, and careful handling of legitimate concurrent edits to *different* fields) is a real architectural addition, not a centralization of existing logic, and deserves its own dedicated design/test pass rather than being bundled in here under time pressure. Same underlying gap applies to concurrent payment (`paid`/`amount`) updates on the same route.

### 7. `Analytics'` `roomsReadySnapshot()` disagrees with the live Housekeeping board
**Classification: BUG (reporting-only, not physically wrong).**
Analytics counts raw `HousekeepingUnitState.status`; the live board applies two real-time overrides (`roomEffectiveStatus()` — a pending same-day checkout forces "todo" even if raw status says otherwise, and a "todo" unit with no checkout due and a prior real clean reclassifies to "clean"). The two "rooms ready" counts can disagree for identical underlying data. **Not fixed this pass**: correcting this requires either exposing `roomEffectiveStatus()`'s inputs (today's bookings) to the Analytics data-fetcher or restructuring how that snapshot is computed — a real but non-trivial data-shape change, deferred pending a dedicated look at the Analytics housekeeping pipeline.

### 8. Night Clean Bonus — three subtly different implementations
**Classification: BUG (payroll-adjacent — real money, treated with extra caution) + TECHNICAL DEBT.**
`computeTeamBreakdown()` (the canonical aggregate) uses the current portfolio-wide rule; `my-earnings/route.ts`'s per-row table reimplements the same rule independently (acknowledged in its own comment); the "Lifetime earnings" figure on the same page uses a *different, legacy* same-unit/day≥2 rule. A housekeeper's Lifetime and This-month bonus totals are computed by genuinely different formulas. **Not fixed this pass, deliberately**: this touches real people's displayed earnings; a fix should be verified against real historical payroll figures before/after with a human reviewer, not shipped in the same pass as unrelated centralization work. Flagged as the highest-priority item for a dedicated follow-up.

### 9. Airbnb→BankTransfer payment-method assumption — inconsistent fallback
**Classification: DESIGN ISSUE (narrow edge case).**
`BookingsView.tsx` substitutes BankTransfer only when `method` is null; `analytics/revenue.ts` substitutes unconditionally, even overriding an explicitly-recorded different method. Affects only Airbnb bookings where staff manually recorded a non-BankTransfer method. Low real-world frequency; documented, not fixed.

### 10. Dashboard's accrued-operational-costs math duplicated inline
**Classification: TECHNICAL DEBT (no live bug — verified the two formulas currently agree).**
`useMonthlyProfitSummary.ts` hand-reimplements what `analytics/financials.ts`'s `accruedOperationalCostsCentavos()` already consolidates, kept in sync only by comment cross-reference, not the compiler. A future new cost category added to one has no enforced guarantee of reaching the other. Documented as a drift risk for the Centralization Plan, not urgent.

### 11. No confirmed UI trigger for marking a booking `checkedOutAt`
**Classification: TEST-DATA ISSUE / UNKNOWN** (carried forward from the earlier functional-spec pass — restated here since it's directly relevant to the booking lifecycle audit). Server-side support and a real downstream side effect (access-code release) exist; no client call site was found. Needs confirming with a human whether this UI genuinely doesn't exist or was simply not located.

### 12. `Booking.conflict` not visually surfaced on the Calendar grid
**Classification: DESIGN ISSUE** (carried forward). The field is set by the iCal importer and shown only as a list-view tag on Bookings, never on the Calendar grid itself.

### 13. Parking and Management Fee — do not exist
**Classification: TEST-DATA ISSUE** (the originating audit brief's own assumption, not a codebase defect). Verified directly against `prisma/schema.prisma` and `src/lib/pricing/rates.ts`: no field, no model, no pricing-engine line for either concept. Per explicit user direction, **not built as new functionality** in this pass — documented here so it isn't mistaken for a regression or an oversight.

### 14. Gamification team rosters and one payroll figure don't match the audit brief's assumptions
**Classification: TEST-DATA ISSUE.** Verified against live `Employee.teamKey`/`salaryRate` data:
- Real Team A: Earl Domingo, Louis Phillip Falaminiano, Riemar Ligad.
- Real Team B: Christian Baluyot, Manex Apagalang.
- Real Team C: Justine Oliva, Mark Anthony Licud.
- Mharies Arceo currently has **no team assigned**. "Augustine Ferrer" is not an active employee.
- "Christian: ₱15,000/month" matches **Christian Elesterio** (Housekeeping) — a different person from **Christian Baluyot** (Booker, real Team B), whom the brief's stated Group C also names, conflating two different people.

The database (`Employee.teamKey`, `salaryRate`, `SalaryHistory`) is already the correct, already-centrally-consumed canonical source — per the user's explicit decision, the brief's stated rosters/figures were **not** hardcoded into any new "canonical" function, since doing so would have silently reassigned real people to wrong teams.

### 15. Two leftover QA test employee records in production
**Classification: TEST-DATA ISSUE.** "QA REFRESH TEST NAME" and "QA Verify User" (both role BOOKER, ownerId Evangelina's Staycation) found still active during the payroll data-verification query. Not removed in this pass (not requested, and deleting production rows without explicit instruction is out of scope for this audit) — flagged for the user's own cleanup.

### 16. 37 previously-flagged conflicting booking pairs (carried forward)
**Classification: UNKNOWN.** When the stay-type-based conflict-detection bug (historical fix #14 in the functional spec) was corrected, a production scan found 37 pairs of bookings that register as real conflicts under the corrected logic — flagged for manual review at the time, not auto-touched. Not re-verified as resolved or still-outstanding in this pass.
