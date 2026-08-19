# Evangelina's Staycation — Functionality Inventory

This is the "first principle" document this audit's own brief called for: understand the whole application before touching anything. The full feature-by-feature inventory (26 functional areas, 145 API routes, 41 pages, 50 database models, every business rule with file citations) already exists as **[EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md](EVANGELINAS_STAYCATION_FUNCTIONAL_SPEC.md)**, produced in a prior pass of this same engagement via direct source inspection — not re-derived here to avoid a near-duplicate document. This inventory adds the one thing the functional spec didn't have yet: **which canonical implementation owns each concept**, the specific new input this audit's own research produced.

## Feature area → canonical implementation

| Feature area | Canonical owner | Status after this audit |
|---|---|---|
| Booking creation/edit/cancel/refund | `bookingService.ts`, `bookingSchema` (`validation.ts`) | Clean, single source (confirmed) |
| Booking occupied-window / conflict detection | `stayRange.ts`'s `getOccupiedWindow`/`bookingsConflict` | Clean, single source (confirmed) |
| Checkout/check-in calendar-day display | `stayRange.ts`'s `checkoutDisplayDay`/`nominalCalendarDay` | **Fixed & extended this pass** — was Bookings-tab-only, now also Housekeeping |
| Booking lifecycle/status (staff) | `BookingsView.tsx`'s `lifecycleStatus()` | Deliberately distinct from guest-facing status (documented) |
| Booking lifecycle/status (guest) | `bookingStatus.ts`'s `guestJourneyStage`/`isBookingCompleted` | **Fixed this pass** — real UTC+8 offset bug |
| Commission eligibility | `bookingStatus.ts`'s `isCommissionEligible` | Clean, single source (confirmed) |
| Pricing/quote | `pricing/rates.ts`'s `quotePrice` | Clean, single source (confirmed). Parking/Management Fee **do not exist** |
| Payment/balance | `finance.ts` | Clean, single source (confirmed prior 6-way duplication already consolidated) |
| Revenue/profit/occupancy/ADR/RevPAR | `finance.ts` + `analytics/financials.ts` (explicit re-export shim) | Mostly unified; one low-risk drift point documented, not fixed |
| Payroll/compensation | `payroll.ts` | Real DB-driven source confirmed correct; Night Clean Bonus has 3 divergent implementations, deferred |
| Gamification (Elite Booker Challenge) | `gamification.ts` | Clean, single source. Team rosters verified against real data (see Business Rules doc) |
| Achievement unlocking | `my-earnings/route.ts` (single call site) | Clean, single source (confirmed) |
| Housekeeping cleaning-needed scheduling | `HousekeepingView.tsx`'s `schedule` | **Fixed this pass** — now uses the canonical occupied-window engine |
| Housekeeping status (live board) | `roomEffectiveStatus()` | Clean within its own surface; diverges from Analytics' separate snapshot (documented, deferred) |
| Housekeeping tardiness ("how late") | `stayRange.ts`'s `minutesLateFor` | **Fixed & centralized this pass** — was duplicated in 2 routes, both wrong |
| Housekeeping start/finish concurrency | In-transaction precondition (`housekeeping/unit/[id]/route.ts`) | **Fixed this pass** — closed a confirmed-reproducible race |
| TTLock code generation/lifecycle | `access/service.ts` (sole gatekeeper, confirmed) | GUEST-type race **fixed this pass** (confirmed exploited in production, 4 real incidents cleaned up) |
| Meter Reading | `MeterReading` model + Gemini pipeline (`lib/gemini.ts`, `lib/meterReadingPrompt.ts`) | Not touched this pass — no duplication found in the earlier functional-spec audit |
| Booking source/platform | `platform`/`source` fields, `normalizeStayTypeForPlatform` | Mostly clean; one narrow Airbnb-payment-method edge case documented |
| Authentication (staff) | `auth.ts` (NextAuth JWT) | Impersonation + staycation-switch interaction verified **SAFE** this pass |
| Authentication (guest) | `guestSession.ts` | Not re-audited this pass (covered in the earlier functional spec) |
| Authorization (RBAC) | `rbac.ts`, `actionAccess.ts`, `pageAccess.ts` | Not re-audited this pass beyond the impersonation interaction (covered in the earlier functional spec) |
| Multi-staycation data isolation | `unitWhere`/`unitIdWhere`/`isUnitInScope` (`session.ts`) | Not re-audited this pass beyond the impersonation-switch interaction |

## Concurrency posture (new this pass — not covered by the earlier functional spec)

| Scenario | Status |
|---|---|
| Concurrent booking edit (same field) | Vulnerable, documented, deferred |
| Concurrent Start Cleaning | **Fixed** |
| Concurrent payment update | Vulnerable, documented, deferred (same gap as booking edit) |
| Double-submit booking create | Protected (incidentally) |
| Cancel vs. in-progress clean | Protected |
| Concurrent TTLock guest-credential request | **Fixed** (confirmed exploited in production) |

## What this document deliberately does not repeat

Full route/model/role inventories, external integration details, offline/PWA behavior, mobile/responsive conventions, and the 26-item historical-bug ledger all already exist in the functional spec with exact file:line citations — see that document directly rather than a summary here that would inevitably drift out of sync with it.
