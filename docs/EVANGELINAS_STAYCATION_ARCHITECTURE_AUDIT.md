# Evangelina's Staycation — Architecture Audit

Companion to [EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md](EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md) (what the app does) — this document covers **how consistently it does it**: duplicated business logic, security/concurrency posture, and what was centralized versus deferred in this audit.

---

## 1. Method

Two dedicated research passes, both read-only, both independently cross-verified against the actual source before any fix was written:
1. A systematic search across 12 named business concepts (pricing, duration, checkout/check-in dates, booking status, payment/balance, commission, revenue/profit/occupancy, payroll, booking source, housekeeping status, TTLock, achievements) for every place each is computed, checking whether independent implementations agree.
2. A targeted security/concurrency review: the impersonation + multi-staycation-switch interaction, and 6 named concurrency scenarios (concurrent booking edit, concurrent Start Cleaning, concurrent payment update, double-submit booking create, cancel-vs-in-progress-clean, concurrent TTLock credential requests).

---

## 2. Duplicated business logic — findings and disposition

| # | Concept | Verdict | Disposition |
|---|---|---|---|
| 1 | Pricing / quote calculation | CLEAN — single source (`quotePrice()`, `rates.ts`) | No action needed |
| 2 | Duration / nights calculation | CLEAN — single source (`nightsFor()`/`occupiedRange()`) | No action needed |
| 3 | Checkout/check-in date derivation | **DIVERGENT** — `checkoutDisplayDay()` adopted in exactly one place (Bookings tab) | Housekeeping schedule fixed this pass (§Known Issues #4); guest-facing display components (`GuestWelcomeBanner`, `JourneyTimeline`, `BookingDetailClient`, `GuidebookView`) still read raw `checkOutDate` — deferred, lower severity (display-only, guest already sees the correct real-time stage via the fixed `guestJourneyStage`) |
| 4 | Booking status/lifecycle | **DIVERGENT** — 3 independent implementations, one (`guestJourneyStage`) with a severe bug | Fixed this pass (§Known Issues #1). `lifecycleStatus()` in BookingsView remains a deliberate third implementation (day-granularity, documented) |
| 5 | Payment/balance calculation | CLEAN — single source (`finance.ts`), confirmed a prior 6-way duplication was already consolidated | No action needed |
| 6 | Commission eligibility | CLEAN — single source (`isCommissionEligible()`) | No action needed |
| 7 | Revenue/profit/occupancy pipelines | Mostly unified; one structural duplication (Dashboard's accrued-cost math vs. Analytics' consolidated version, currently identical but hand-synced) | Documented as technical debt (§Known Issues #10), not fixed — no live bug |
| 8 | Payroll/compensation calculation | **DIVERGENT** — Night Clean Bonus reimplemented per-row, and the "Lifetime" figure uses a legacy formula different from weekly/monthly | Deferred deliberately (§Known Issues #8) — real payroll figures, needs a dedicated pass with human review of before/after numbers |
| 9 | Booking source/platform handling | Mostly clean; one narrow divergence (Airbnb→BankTransfer fallback, conditional in one place vs. unconditional in another) | Documented (§Known Issues #9), low real-world frequency |
| 10 | Housekeeping status derivation | **DIVERGENT** — Analytics' `roomsReadySnapshot()` vs. live board's `roomEffectiveStatus()` | Documented (§Known Issues #7), deferred — needs a data-shape change, not a quick fix |
| 11 | Housekeeping "how late" formula | **DIVERGENT, severe bug** — hand-duplicated in 2 routes, both comparing a real timestamp against an unconverted placeholder | **Fixed this pass** (§Known Issues #3) — centralized into `minutesLateFor()` |
| 12 | TTLock code generation/lifecycle | CLEAN — `src/lib/access/service.ts` confirmed as the sole gatekeeper | No action needed (the race condition found here, #13 below, is a concurrency issue, not a duplication issue) |
| 13 | Employee reward/achievement calculation | CLEAN — single source | No action needed |

**Summary**: of 13 audited concepts, 6 were already correctly centralized with no action needed, 4 had real divergent-logic bugs (3 fixed this pass, 1 deferred pending a data-shape change), 2 are deliberate/documented differences, and payroll's Night Clean Bonus divergence is deferred specifically because it touches real compensation figures.

---

## 3. Security review

### Impersonation + multi-staycation-switch interaction — **SAFE**

Verified character-by-character: the 16-field snapshot (`token.realUser`) taken at impersonation start and the 16-field restore on stop are an exact match, not a subset. The `__switchOwner` branch only ever mutates 6 of those 16 fields, all fully overwritten on stop. A mid-impersonation switch never persists `lastActiveOwnerId` to the database (explicitly skipped while impersonating). No path was found where a switch performed during impersonation could leak into the restored real-admin session. This interaction was deliberately reasoned about by a previous engineer — comments in `auth.ts`, `staycationSwitch.ts`, and the switch API route all independently describe the same safety property, and the code matches what the comments claim.

### Concurrency scenarios

| Scenario | Verdict (before this audit) | Status |
|---|---|---|
| Concurrent booking PATCH (same field) | **VULNERABLE** — no version check, last-write-wins | Documented, deferred (§Known Issues #6) |
| Concurrent "Start Cleaning" | **VULNERABLE** — no precondition check | **Fixed this pass**, live-verified with real concurrent HTTP requests |
| Concurrent payment PATCH | **VULNERABLE** — same route/gap as booking PATCH | Documented, deferred (same underlying fix as #6) |
| Double-submit booking create | PROTECTED (incidentally, via the availability-conflict transaction) | No action needed — works, though the retried request surfaces as a 409 rather than a clean idempotent success (a UX rough edge, not a data-integrity one) |
| Cancel vs. in-progress clean | PROTECTED (indirectly — the housekeeping route re-validates `cancelledAt` on every bookingId-bearing PATCH) | No action needed for data integrity; the cleaner-facing UX of a hard-failed finish request mid-clean is unpolished but not incorrect |
| Concurrent TTLock guest-credential requests | **VULNERABLE — confirmed exploited in production** (4 real duplicate-credential incidents found) | **Fixed this pass**, live-verified with real concurrent DB writes |

---

## 4. What changed vs. what's recommended for later

**Centralized/fixed this pass** (all with new automated test coverage, all live-verified against real production data or a real running server — never assumed correct from reading code alone):
- `isBookingCompleted()` / `guestJourneyStage()` real-instant + nominal-day handling (`bookingStatus.ts`)
- `minutesLateFor()` — new canonical function in `stayRange.ts`, replacing 2 duplicated implementations
- `checkoutDisplayDay()` / `nominalCalendarDay()` generalized and adopted by Housekeeping's schedule (previously adopted only by Bookings)
- TTLock GUEST-credential race — partial unique index + catch-and-cleanup, plus remediation of 4 real production incidents
- Concurrent "Start Cleaning" race — in-transaction precondition check

**Recommended next, in priority order** (none attempted this pass, each reasoned about above):
1. Night Clean Bonus formula unification (real payroll impact — needs human-reviewed before/after figures)
2. Optimistic concurrency on booking/payment PATCH (real architectural addition — version field + migration)
3. Align Analytics' `roomsReadySnapshot()` with the live board's effective-status logic
4. Propagate `checkoutDisplayDay()` to the remaining guest-facing checkout-date displays
5. Airbnb→BankTransfer fallback consistency (low priority, narrow edge case)
