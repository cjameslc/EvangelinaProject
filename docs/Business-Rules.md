# Business Rules

> Part of the [Evangelina's Staycation documentation](README.md).

Every rule below is drawn directly from the code that enforces it (file cited per section) — not from a separate spec document. Where a figure is admin-configurable (via `Settings`), that's noted; everything else is a fixed rule requiring a code change.

- [Roles & permissions](#roles--permissions)
- [Stay types](#stay-types)
- [Pricing & the weekday-night promo](#pricing--the-weekday-night-promo)
- [Down payment](#down-payment)
- [Same-day booking window](#same-day-booking-window)
- [Cancellation vs. refund](#cancellation-vs-refund)
- [Commission eligibility](#commission-eligibility)
- [Payroll formula](#payroll-formula)
- [Occupancy, ADR, RevPAR](#occupancy-adr-revpar)
- [Revenue goals & the unit leaderboard](#revenue-goals--the-unit-leaderboard)
- [Elite Booker Challenge](#elite-booker-challenge)
- [Booking ID (confirmation number) validity](#booking-id-confirmation-number-validity)
- [Coupons](#coupons)
- [Guest feedback rewards](#guest-feedback-rewards)

## Roles & permissions

Source: `src/lib/rbac.ts`, `src/middleware.ts`, `src/lib/constants.ts` (`NAV_ITEMS`).

| Role | Dashboard | Analytics | Bookings | Calendar | Housekeeping | Auditor | Admin | My Earnings |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **OWNER_ADMIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CO_OWNER** | ✅ (own units) | ✅ (own units) | ✅ (own units) | ✅ (own units) | ✅ (own units) | ✅ | ❌ | ✅ |
| **HOUSEKEEPING** | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **BOOKER** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **AUDITOR** | ❌ | ❌ | ❌ (`canSeeBookings` excludes Auditor) | ❌ | ❌ | ✅ (read-only) | ❌ | ✅ |

Additional narrower rules:
- A **Booker** may only edit or cancel a booking they themselves logged (`Booking.bookerId` match) — every other role with edit access can touch any booking.
- A **Booker** can never hard-delete a booking (only cancel, with a required reason); Owner/Admin, Co-owner, and Housekeeping can still hard-delete.
- Adding a **new** housekeeping stock item is Owner/Admin-only; adjusting an existing item's count is any Housekeeping-capable role.
- Auditor and Housekeeping are **read-only on financial records** (`isReadOnlyFinancials`).
- A **CO_OWNER**'s visible data is filtered to only their assigned units (`UnitOwner` join table) everywhere — Dashboard, Analytics, Bookings, Calendar, Housekeeping.

## Stay types

Source: `src/lib/constants.ts` (`STAY_TYPES`), `src/lib/pricing/rates.ts`.

| Type | Duration | Guest Portal? | Notes |
|---|---|---|---|
| **Daycation** | 12 hrs | ✅ | Uses the 12h rate tier |
| **Night** | 12 hrs | ✅ | Uses the 12h rate tier; the only type eligible for the weekday-night promo |
| **Full** | 21 hrs | ✅ | Uses the 21h rate tier; never discounted |
| **Flexible** | Same day, guest/staff-chosen check-in/out time | ✅ — guest-selectable in `BookFlowView.tsx`, not staff-only | Priced at the 12h tier; counts as "Night-like" for promo purposes only if its chosen check-in time is 5:00 PM or later. Also carries a flat, once-per-booking **Flexible-time fee** (`Settings.flexibleTimeFee`, default ₱150) added on top of the tier rate — see [quotePrice()](../src/lib/pricing/rates.ts) |
| **Cleaning** / **Maintenance** | — | Internal only | Calendar-block types, not real bookings |

## Pricing & the weekday-night promo

Source: `src/lib/pricing/rates.ts`.

- One rate table for the whole property — **no per-unit rate variation**.
- Rate depends on stay type (12h vs. 21h tier) and whether the night in question falls on a **weekend** (Friday/Saturday/Sunday, evaluated on the **Asia/Manila** calendar day) or **weekday** (Monday–Thursday).
- All four rates are Admin-configurable in Settings: `weekdayRate12h`, `weekdayRate21h`, `weekendRate12h`, `weekendRate21h` (defaults ₱1,499 / ₱1,699 / ₱1,699 / ₱1,899).
- **10% weekday-night promo**: applies only to a **Night**-stay night (or a Flexible stay whose check-in is 5 PM or later) that falls on a **weekday**. Daycation and Full stays are never discounted, regardless of day. The percentage is Admin-configurable (`weekdayNightPromoPct`, default 10%).
- A multi-night stay is priced **night by night** — a stay crossing a weekday→weekend boundary charges each night its own correct rate/promo, not just the check-in day's rate applied to every night.
- Amounts are rounded to whole pesos (this app's existing money convention), not centavo-precise like the newer Analytics fields.

## Down payment

Source: `src/lib/pricing/rates.ts` (`splitDownPayment`).

- The down payment is a flat amount (`Settings.dpFee`, default ₱500), capped at the total (a very small booking never has a "negative" balance).
- A guest chooses **full payment** or **down payment** at booking time (`Booking.paymentType`).
- Critically: choosing "down payment" does **not** immediately set `Booking.dpAmount`. That field means "actually collected" everywhere else in the app (it's what `collectedRevenueCentavos()` in `src/lib/analytics/revenue.ts` unconditionally counts as recognized revenue). The guest's chosen amount is recorded separately as `intendedDpAmount` and only promoted to the real `dpAmount` once the AI payment-verification step (see [Integrations.md](Integrations.md#google-gemini)) auto-approves the uploaded proof.

## Same-day booking window

Source: `src/lib/bookingEngine/bookingWindow.ts` (referenced throughout — not separately re-read for this pass; behavior confirmed via `guest/booking-quote` and `guest/bookings` routes, which both call `isStayTypeBookableNow(stayType, date, checkInTime)` and treat a same-day booking outside that window identically to "unit unavailable," never as its own distinct message).

## Cancellation vs. refund

Source: `Booking` model comments in `prisma/schema.prisma`, `src/lib/bookingStatus.ts`.

These are **independent** concepts, not one flowing from the other:

| Action | Field(s) set | Effect on commission | Notes |
|---|---|---|---|
| **Cancel** | `cancelledAt`, `cancellationReason` | None by itself — money already kept still earns commission | Soft-delete (row stays, for guest history + audit trail). A Booker can cancel only their own booking, always with a reason. |
| **Refund** | `refundedAt`, `refundReason` | Always reverses commission | Independent of cancellation status — a booking can be refunded without being cancelled, or cancelled with the deposit kept (no refund). |

`amount`/`dpAmount`/`paid` are **never** rewritten by either action — both are audit-trail-preserving factual records layered on top of the original payment data.

## Commission eligibility

Source: `src/lib/bookingStatus.ts` (`isCommissionEligible`).

```
if booking.refundedAt        → NOT eligible (always wins)
else if booking.paid         → eligible
else if cancelled AND dpAmount > 0 → eligible (money kept on a cancelled booking still counts)
else                          → not eligible
```

Deliberately **independent of whether the stay has actually happened yet** — a same-day paid booking earns commission immediately, it doesn't wait until checkout/midnight.

## Payroll formula

Source: `src/lib/payroll.ts` — the single formula used by both the Dashboard summary and the Admin Weekly Report (no duplicated logic).

| Role | Formula |
|---|---|
| **Housekeeping** | `cleaningDays × housekeepingDayRate` (default ₱700/day) **+** evening incentive: a flat `housekeepingNightBonus` (default ₱300) once per **(unit, day)** where this cleaner completed 2+ bookings for that same unit checking out at/after 5:00 PM that day |
| **Booker** | `completedBookingCount × bookerCommission` (default ₱100/booking), counting only commission-eligible bookings (see above) |
| **Auditor** | Flat `auditorWeeklyRate` (default ₱0 — not configured by default), scaled by however many weeks the reporting window covers |

Any `WeeklyExpense` targeted at an employee (category `GENERAL`, e.g. a manually-logged "Salary" advance) is deducted from their total; untargeted `TIKTOK_ADS` expenses affect Net Profit only, never an individual's pay.

## Occupancy, ADR, RevPAR

Source: `src/lib/analytics/occupancy.ts`, shared by Dashboard and Analytics (not two separately-derived calculations).

- **Occupied nights** — per **(unit, calendar day)**, deduped, not a flat sum of every booking's own night-count. A unit can legally have both a Daycation and a Night/Full stay on the same real calendar day (`bookingsConflict()` in `stayRange.ts` deliberately allows this — they occupy different real-timestamp windows, e.g. 8am–8pm vs 9pm–9am), but `occupiedRange()`'s day-granularity view of that same day is identical for both bookings. Summed without dedup, that one day counted as *two* occupied nights against *one* available night for that unit that day — a real, confirmed bug (verified live: reported "This Month" occupancy dropped from 81% to the correct 76% once fixed, using real July 2026 production data with 6 genuinely-overlapping unit-days). A unit-day now counts as occupied at most once.
- **ADR** (Average Daily Rate) = collected room revenue ÷ real occupied nights (`nightsFor()` — a 3-night Full stay counts as 3, not 1 booking).
- **RevPAR** (Revenue Per Available Room) = collected room revenue ÷ available room-nights (unit count × days in the period, minus Maintenance-blocked nights only — a Cleaning/turnover block still counts as "available," matching how real hospitality PMS metrics define the term).

## Revenue goals & the unit leaderboard

Source: `src/lib/analytics/revenueGoals.ts`. Every unit has a monthly revenue target — `Unit.monthlyRevenueTargetOverride` if set, else the property-wide `Settings.monthlyRevenueTargetPerUnit` (default ₱50,000). `pctComplete = round(currentPesos / targetPesos × 100)`, used for the on-screen display and the `at_risk`/`behind`/`on_track`/`ahead`/`achieved` status bucket.

**The leaderboard (and the "Top Performing Unit" milestone badge) rank by the real, unrounded ratio — not `pctComplete`.** Two units a few hundred pesos apart can round to the identical whole-number percent (confirmed live: ₱41,193/₱50,000 = 82.39% and ₱40,758/₱50,000 = 81.52% both displayed "82%"); sorting on the already-rounded field left ties broken by whichever order the units happened to be in (their Admin-configured `sortOrder`) rather than who actually earned more. Fixed to sort on `currentPesos / targetPesos` directly, with raw `currentPesos` as the final tiebreaker for a genuine exact-ratio tie. The same bug existed in the Teams module's "priority unit" (worst-first) picker (`src/app/api/gamification/teams/route.ts`) and was fixed identically.

## Elite Booker Challenge

Source: `src/lib/gamification.ts` (`ELITE_TIERS`), `EliteBookerAward` model.

A **company-wide** (not per-unit), **monthly**, completed-booking-count milestone challenge with limited reward slots per tier:

| Tier (bookings) | Bonus | Slots | Badge |
|---:|---:|---:|---|
| 50 | ₱500 | 2 | 🥉 Bronze Booker |
| 100 | ₱1,500 | 2 | 🥈 Silver Booker |
| 150 | ₱2,500 | 2 | 🥇 Gold Booker |
| 200 | ₱3,500 | 1 | 💎 Platinum Booker |
| 250 | ₱5,000 | 1 | 👑 Legend Booker |

Open to anyone who can be assigned as a booking's booker (Bookers, and Housekeeping staff who also take bookings) — sharing the same slot pool. Once a slot is awarded (unique per employee+month+tier) it is **never reassigned or revoked**, even if a later recompute would reorder who "should" have won — `completedAt` on the exact tier-crossing booking is the permanent tiebreaker for who reached it first.

## Booking ID (confirmation number) validity

Source: `src/lib/bookingEngine/confirmationValidity.ts`, `src/lib/bookingEngine/confirmationNumber.ts`. See [Booking.md](Booking.md#confirmation-number-validity) for full detail.

- Generated for **every** booking (guest self-service, staff-manual, bulk import — one shared creation path) — format `EVA-XXXXXX`, unique, visually-unambiguous alphabet.
- Valid from creation through `checkOutDate` (or `date` for a same-day stay) **plus a 24-hour grace period** — an extended stay's later checkout date is honored automatically.
- **Never valid on a cancelled booking**, regardless of dates.
- Used for guest login (email + code) and for revealing WiFi/door-code (re-entered even by an already-signed-in guest).
- An **OWNER_ADMIN** can **reactivate** (extend validity 30 days past the normal window) or **regenerate** (issue a brand-new code, immediately invalidating the old one) — both explicit, audited actions; the code is never editable as a free-text field.

## Coupons

Source: `Coupon` model, `src/lib/bookingEngine/couponService.ts` (referenced via `guest/coupon-check` and `guest/bookings` routes).

- Admin-managed, `type` is `"percent"` (1–100) or `"fixed"` (a peso amount).
- Optional `maxUses` (null = unlimited) and `expiresAt`.
- Applied **on top of** (stacked after) the weekday-night promo, not instead of it.
- A booking's applied discount is a **denormalized snapshot** (`Booking.couponCode`/`couponDiscountAmount`) — editing or deleting the `Coupon` later never rewrites what a past guest actually paid.
- Re-validated fresh, server-side, inside the same transaction as booking creation — a coupon that's expired/exhausted since the guest last saw it applied causes the whole booking to be rejected, never silently charged at full price under a "discounted" label.

## Guest feedback rewards

Source: `FeedbackResponse` model.

- A 5-step post-stay survey, **one response per booking** — enforced at the database level (`bookingId` is `@unique`), so a duplicate/replayed submission can never mint a second reward.
- Three reward types: `discount` (a genuine single-use `Coupon` row is created, ₱100 off per the guidebook copy), `late_checkout`, `coffee` — the latter two are redeemed in person by staff, tracked via `redeemedAt`.
