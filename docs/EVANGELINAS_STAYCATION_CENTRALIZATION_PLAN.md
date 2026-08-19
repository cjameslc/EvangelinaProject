# Evangelina's Staycation — Centralization Plan

The target architecture this audit worked toward: one canonical implementation of each important business rule, every consumer using it, permanent tests proving a future change can't silently reintroduce the same regression class.

```
                 Canonical Domain
                 Business Rules
                        │
        ┌───────────────┼───────────────┐
        │               │               │
     Calendar        Bookings        Dashboard
        │               │               │
        └───────────────┼───────────────┘
                         │
                  API / Services
                         │
                     Database
```

## Domain module map (current state, not a proposed rewrite)

The codebase already has real domain separation — this audit strengthened it rather than restructuring it wholesale:

```
src/lib/
  stayRange.ts          — booking occupied-window engine (getOccupiedWindow, bookingsConflict,
                           checkoutDisplayDay, nominalCalendarDay, minutesLateFor — this audit's
                           canonical home for every occupied-window-derived calculation)
  bookingStatus.ts       — booking lifecycle (guestJourneyStage, isBookingCompleted,
                           isCommissionEligible, paymentLabel) — deliberately Prisma-free,
                           importable from client components
  pricing/rates.ts        — quotePrice, splitDownPayment, applyCouponDiscount
  finance.ts              — collectedAmountPesos/grossAmountPesos/outstandingBalanceCentavos
  payroll.ts               — monthlySalaryFromRate, computeTeamBreakdown, Night Clean Bonus
  manilaTime.ts             — Asia/Manila primitives (manilaDayKey, manilaWallClockToRealInstant,
                              isManilaWeekend) — zero dependencies, safe for every other module
  analytics/                — financials.ts (explicit re-export shim over finance.ts),
                               occupancy.ts, housekeeping.ts, revenue.ts
  access/service.ts          — sole gatekeeper for TTLock calls + AccessCredential writes
  gamification.ts             — Elite Booker Challenge tier/slot logic
```

This already matches the mission brief's suggested shape closely enough that a wholesale restructure into a new `domain/` tree was judged not worth the churn/regression-risk it would introduce — the real gap was **consistent consumption** of these existing modules, not their absence.

## What was centralized this pass

| Business rule | Before | After |
|---|---|---|
| "What calendar day does this checkout timestamp fall on" | Reimplemented raw in `HousekeepingView.tsx`; a narrower version (`checkoutDisplayDay`) existed only for the Bookings tab | `checkoutDisplayDay()`/`nominalCalendarDay()` in `stayRange.ts`, consumed by both |
| "Is this booking's stay actually over, in real time" | `isBookingCompleted()` had the concept right but the math wrong; `guestJourneyStage()` never got either | Both fixed and now share the same real-instant + nominal-day conversion pattern |
| "How late did this cleaning start" | Hand-duplicated in 2 API routes, both independently wrong | `minutesLateFor()` in `stayRange.ts`, both routes delegate to it |
| "Is this booking's booking already being cleaned" (concurrency) | No check at all | In-transaction precondition, closing a real race |
| "Does this booking already have a live guest door code" (concurrency) | Check-then-act with a real exploitable gap | Partial unique index + catch-and-cleanup |

## What was deliberately NOT centralized this pass, and why

| Item | Why deferred |
|---|---|
| Night Clean Bonus (3 divergent implementations) | Touches real people's displayed pay. A centralization here needs a human comparing real before/after payroll figures for at least one full pay period before shipping — not something to bundle into a broader sweep. **Recommended as the very next piece of work**, isolated to its own change. |
| Booking/payment PATCH optimistic concurrency | Not a duplication to consolidate — a genuinely new safety mechanism (version field, migration, careful handling of legitimate concurrent edits to different fields). Real architectural addition, deserves its own design pass. |
| Analytics `roomsReadySnapshot` vs. live board | Needs the Analytics data-fetcher to gain access to "today's bookings," a data-shape change beyond swapping in an existing function. |
| Parking / Management Fee | **Explicitly out of scope per user decision** — these don't exist in the app; building them is a new-feature decision with real revenue impact, not something to add while centralizing existing logic. |
| Guest-facing checkout-date display components | Same bug class as the Bookings-tab fix, lower severity (display-only; the functional booking-stage the guest sees is already correct via the `guestJourneyStage` fix). Good first candidate for a quick follow-up pass. |
| Airbnb→BankTransfer fallback | Narrow edge case, low real-world frequency, low risk either way. |

## Recommended sequencing for future work

1. **Night Clean Bonus unification** — highest real-world stakes (payroll), needs a human in the loop.
2. **Guest-facing checkout-date display propagation** — same fix pattern already proven twice in this audit, low risk, quick.
3. **Booking/payment optimistic concurrency** — real architectural work, plan it as its own initiative with a migration.
4. **Analytics/live-board housekeeping-status alignment** — needs a small data-shape change to the Analytics housekeeping query.
5. Everything else in Known Issues — lower urgency, no confirmed live bug behind most of them.

## Principle for future changes (the actual deliverable of this whole audit)

Before writing any new date/time, pricing, payroll, or status logic anywhere in this codebase, ask: **does this concept already have a canonical implementation in `stayRange.ts`, `bookingStatus.ts`, `finance.ts`, or `payroll.ts`?** If yes, import it. If the existing one doesn't quite fit, extend it there rather than reimplementing nearby — every bug this audit found was exactly that: a second, slightly-different copy of logic that already existed correctly somewhere else in the codebase.
