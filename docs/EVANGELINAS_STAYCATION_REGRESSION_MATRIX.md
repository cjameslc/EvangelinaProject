# Evangelina's Staycation — Regression Matrix

What's now under permanent automated test, what's verified only by live/manual checks performed during this audit, and what remains untested. See [EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md §36](EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md#36-qa-testability-matrix) for the broader per-feature testability assessment; this document is specifically about what changed as a result of this audit.

---

## Automated test suite

| File | Tests | Covers |
|---|---|---|
| `src/lib/stayRange.test.ts` | 34 | `bookingsConflict`, `getOccupiedWindow`, `windowsOverlap`, `checkoutDisplayDay`/`lastOccupiedDay` (incl. the original THE-4UB8X6 midnight + EVA-BRFSWK 4pm-boundary regressions), `minutesLateFor` (new — the real-instant tardiness fix) |
| `src/lib/bookingStatus.test.ts` | 16 | `isBookingCompleted`, `guestJourneyStage` (new — the 8-hour real-instant offset fix, day-bucket correctness for same-day/overnight/multi-night stays, `cancelledAt`/`checkedOutAt` precedence, the no-`stayType` fallback path) |
| `src/lib/access/eventClassifier.test.ts` | 11 | TTLock access-event severity classification (pre-existing, unrelated to this audit) |
| **Total** | **61** | **all passing** |

Before this audit: 2 test files, 27 tests (16 `stayRange` + 11 `eventClassifier`). This audit added 1 new test file and 34 new test cases, all tied to a confirmed real bug, not speculative coverage.

## Live/manual verification performed during this audit (not automated, but genuinely executed — not just read and assumed)

| What | Method | Result |
|---|---|---|
| `isBookingCompleted`/`guestJourneyStage` real-instant math | `tsx` script computing the exact real checkout instant for a live example and comparing against the raw (buggy) vs. fixed comparison | Confirmed the bug, confirmed the fix, confirmed a chaining error in an intermediate draft of the fix before it shipped |
| `minutesLateFor` real-instant math | Same method, concrete numbers | Confirmed a housekeeper starting 1 real hour late was reported on-time pre-fix; confirmed correct post-fix |
| TTLock GUEST-credential race | Real production data query (found 4 existing duplicate-credential incidents) → real cleanup via `revokeCredential()` → real partial-unique-index creation → **3 real concurrent DB inserts** against production, confirmed exactly 1 succeeded | Bug confirmed exploited in production; fix confirmed closes it |
| Concurrent "Start Cleaning" race | **2 real concurrent HTTP PATCH requests** fired against a running server connected to production, against a real unit | Confirmed pre-fix both would have succeeded (by payload analysis); confirmed post-fix exactly one succeeds (200) and the other is rejected (409) |
| Housekeeping schedule checkout-date fix | `tsc --noEmit` + lint clean; logic verified by direct code trace (same engine as the already-live-verified Bookings-tab fix) | Typechecks and lints clean; not separately live-clicked in a browser this pass |
| Impersonation + staycation-switch interaction | Full source read of the 16-field snapshot/restore in `auth.ts`, cross-checked against 3 independent code comments describing the same safety property | Confirmed safe by direct code inspection — not exercised live this pass |

## Not tested this pass (explicitly, not silently)

- Cross-browser/device rendering of any of the fixes above (all changes are server/domain-logic; no UI markup changed).
- The deferred items in Known Issues (booking/payment optimistic concurrency, Analytics room-status divergence, Night Clean Bonus unification, Airbnb payment-method fallback) — none were touched, so none have new test coverage.
- End-to-end browser journeys (create → calendar → bookings → housekeeping → checkout) for Daycation/overnight/midnight/cancellation/payment, as enumerated in a prior QA brief for this engagement — out of scope for this specific audit pass, which focused on centralizing duplicated logic and closing the bugs that search surfaced, not re-running the full booking-lifecycle E2E suite from scratch.

## Regression risk assessment for what shipped

All 5 fixes in this pass are **behavior-preserving except where a confirmed defect required a behavior change** (per the mission's own definition of done):
- `checkoutDisplayDay`/`nominalCalendarDay`/`minutesLateFor`: verified numerically identical to prior behavior for every case that wasn't the specific bug (non-midnight checkouts, on-time/early cleanings) — only the buggy cases produce different (correct) output now.
- TTLock index: purely additive (a new constraint that only ever rejects a state that was already a data-integrity violation); the 4 pre-existing violations were cleaned up first so the constraint could even be created.
- Start Cleaning guard: purely additive (a new 409 rejection path that didn't exist before); no existing successful-request path was changed.

No behavior was changed for cases outside the confirmed bugs.
