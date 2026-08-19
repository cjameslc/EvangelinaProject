# Evangelina's Staycation — Functional Specification

**Purpose**: single source of truth for what this application actually does today, derived entirely from reading the source code, database schema, and git history — not from filenames, prior documentation, or assumption. Every claim below cites a file (and line numbers where practical). Where something could not be confirmed, it is labeled explicitly rather than guessed. See [§38 Actual vs Expected Functionality](#38-actual-vs-expected-functionality) for the master confidence classification.

**Method**: this document was produced by direct inspection of `prisma/schema.prisma` (2,038 lines, 50 models), all 145 files under `src/app/api/**/route.ts`, all 41 files under `src/app/**/page.tsx`, the full business-logic layer (`src/lib/**`), and 288 commits of git history plus in-code comments documenting prior production incidents.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [User Roles](#3-user-roles)
4. [Property / Unit Management](#4-property--unit-management)
5. [Booking Management](#5-booking-management)
6. [Booking Lifecycle](#6-booking-lifecycle)
7. [Pricing](#7-pricing)
8. [Calendar](#8-calendar)
9. [Guest Management](#9-guest-management)
10. [Check-In](#10-check-in)
11. [Checkout](#11-checkout)
12. [Housekeeping](#12-housekeeping)
13. [TTLock](#13-ttlock)
14. [Meter Reading](#14-meter-reading)
15. [Finance](#15-finance)
16. [Expenses](#16-expenses)
17. [Dashboard](#17-dashboard)
18. [Staff](#18-staff)
19. [Booker](#19-booker)
20. [Gamification](#20-gamification)
21. [Guest Experience](#21-guest-experience)
22. [Booking Sources](#22-booking-sources)
23. [Airbnb / iCal](#23-airbnb--ical)
24. [Notifications](#24-notifications)
25. [Offline / PWA](#25-offline--pwa)
26. [Mobile / Responsive](#26-mobile--responsive)
27. [Authentication](#27-authentication)
28. [Authorization](#28-authorization)
29. [Database Models](#29-database-models)
30. [API Inventory](#30-api-inventory)
31. [Page / Route Inventory](#31-page--route-inventory)
32. [Critical Business Rules](#32-critical-business-rules)
33. [System Dependencies](#33-system-dependencies)
34. [Historical Bugs / Fixes](#34-historical-bugs--fixes)
35. [Known Issues](#35-known-issues)
36. [QA Testability Matrix](#36-qa-testability-matrix)
37. [Environment Requirements](#37-environment-requirements)
38. [Actual vs Expected Functionality](#38-actual-vs-expected-functionality)
39. [QA Preparation Requirements](#39-qa-preparation-requirements)
40. [Functional Dependency Map](#40-functional-dependency-map)
41. [Final System Capability Summary](#41-final-system-capability-summary)

---

## 1. Executive Summary

Evangelina's Staycation is a **multi-tenant short-term rental operations platform** — one Next.js codebase now running multiple independently-branded properties ("Evangelina's Staycation" and "The Felian" confirmed live) sharing the same database via a real `Owner`/`OwnerAccess` tenant model, not a fork. It replaces a manual Airbnb-host workflow with: staff booking management, a booking-driven housekeeping board, a real TTLock smart-lock integration with an offline-safe reserve-code fallback, an AI-powered utility-meter-reading feature (Gemini vision), a payroll/commission/gamification system for bookers and housekeeping staff, a guest self-service portal with a digital guidebook, and an owner-facing analytics/dashboard layer built on a single shared financial-calculation library.

**Scale** (all counts independently verified, not estimated): 145 API routes, 41 page routes, 50 Prisma models, 5 staff roles, 288 git commits. Deployed simultaneously to both Vercel and Railway from the same codebase against the same production Turso/libSQL database (confirmed in a prior session of this same engagement, not re-verified in this pass — see [§35](#35-known-issues)).

**What is genuinely real vs. aspirational**: the financial-calculation layer (`src/lib/finance.ts`, `src/lib/payroll.ts`) is a real, single, reused source of truth across Dashboard/Analytics/My Earnings/Leaderboard — not duplicated per-screen logic. The TTLock integration has real retry/fallback engineering born from documented production outages. Conversely, several features exist as defined-but-dead code paths (guest check-in/checkout reminders, a housekeeping code-expiring alert, and the entire `StaffNotification` UI) — these are called out explicitly rather than presented as working.

---

## 2. System Architecture

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js 14.2.35, App Router | `package.json` |
| UI | React 18.3.1, Tailwind CSS 3.4.4 | `package.json`, `tailwind.config.ts` |
| Database | Turso (libSQL/SQLite-family), accessed via `@prisma/adapter-libsql` | `src/lib/prisma.ts`, `package.json` |
| ORM | Prisma 5.20–5.22 | `prisma/schema.prisma` |
| Auth (staff) | NextAuth 4.24.7, JWT session strategy, credentials provider | `src/lib/auth.ts` |
| Auth (guest) | Hand-rolled parallel session system reusing `next-auth/jwt`'s encode/decode as a JWT utility only | `src/lib/guestSession.ts` |
| File storage | Vercel Blob (`@vercel/blob`) — every photo field except a few legacy base64 holdouts | `src/lib/blob.ts` |
| AI — meter reading | Google Gemini (`@google/genai`), model `gemini-3.1-pro-preview` (accuracy-prioritized, deliberately not the app's normal cost-optimized default) | `src/lib/gemini.ts` |
| AI — other (concierge, insights, captions) | Same Gemini client layer, default model `gemini-3.1-flash-lite` | `src/lib/ai/geminiClient.ts` |
| Smart lock | TTLock Open API v3, OAuth2 password grant | `src/lib/ttlock/client.ts` |
| Email | Resend | `RESEND_API_KEY`/`RESEND_FROM_EMAIL` env vars |
| Validation | Zod 3.23.8 | `src/lib/validation.ts` and per-feature schema files |
| Testing | Vitest 4.1.10 | `vitest.config.mts`, 2 test files total (see [§36](#36-qa-testability-matrix)) |
| Offline | Hand-rolled service worker (no Serwist/Workbox) + IndexedDB mutation queue | `public/sw.js`, `src/lib/offlineQueue.ts` |
| Deployment | Vercel (cron: 1 daily slot, Hobby-tier constraint referenced repeatedly in code comments) | `vercel.json` |

**No `next/image` usage** — confirmed 0 `<Image>` components in the codebase (`next.config.js` comment); every image is a local `/public` asset, a Vercel Blob upload, a Google Place photo proxied through `/api/places/photo` (keeps the API key server-only), or an Unsplash photo hotlinked directly per Unsplash's terms.

**Security headers** — `next.config.js` sets a real Content-Security-Policy (not a nonce-based strict-dynamic one — an explicit, documented tradeoff): `script-src` allows `'unsafe-inline' 'unsafe-eval'` plus `maps.googleapis.com` only (the `'unsafe-eval'` is required because the Google Maps JS API itself evaluates dynamically generated code internally, confirmed by live testing per the code comment). `img-src` is restricted to `self`, Vercel Blob, Google/Unsplash hosts. The Next.js image-optimizer remote-pattern wildcard (`hostname: "**"`) was previously an open SSRF/DoS proxy for arbitrary URLs — replaced with an explicit allowlist (`*.public.blob.vercel-storage.com` only).

---

## 3. User Roles

Exactly **5 roles** exist — `Role = "OWNER_ADMIN" | "CO_OWNER" | "HOUSEKEEPING" | "BOOKER" | "AUDITOR"` (`src/lib/prisma-enums.ts`). No others exist anywhere in the codebase. Schema doc comment (`prisma/schema.prisma:74-78`) restates: OWNER_ADMIN sees everything; CO_OWNER has the same feature set but unit-scoped to an explicit `UnitOwner` portfolio; HOUSEKEEPING sees everything except the main financial Dashboard; BOOKER only logs bookings and uses Calendar; AUDITOR is read-only on the quality-inspection trail.

A separate boolean, `User.isPlatformAdmin`, is orthogonal to `role` entirely — it grants access to cross-tenant `/platform` routes only, and does **not** grant "see everyone" on the ordinary business UI (Dashboard/Bookings stay scoped to the admin's own active owner even for a platform admin). See [§28](#28-authorization) for the full permission matrix.

---

## 4. Property / Unit Management

**Model**: `Unit` (`prisma/schema.prisma`, ~60 fields) — `ownerId`, `name`/`unitNumber`/`shortName`, `nightlyRate`, `photoUrl`, `active`, `sortOrder`; guidebook fields (`wifiSsid`/`wifiPassword`/`doorCode`/`checkInInstructions`/`checkOutInstructions`/`videoTutorialUrl`); iCal sync fields (`icalToken`, `icalImportUrl`, `icalLastSyncAt`, `icalLastSyncError`); TTLock mapping fields (`ttlockLockId` unique, `ttlockLockName`, `ttlockHasGateway`, `ttlockBatteryPct`, `ttlockBatterySyncedAt`, `ttlockSyncError`, `ttlockBatteryReplacedAt`); `monthlyRevenueTargetOverride`.

**Management** — `canManageUnits(role)` = `OWNER_ADMIN` only (`src/lib/rbac.ts`). CRUD via `GET/POST /api/units`, `PATCH/DELETE /api/units/[id]`, photo upload `POST /api/units/photo`. A `CO_OWNER`'s visible unit set is restricted to their `UnitOwner` rows everywhere except explicitly documented exceptions.

**Unit-to-lock mapping**: set via `POST /api/ttlock/link`, which re-verifies the chosen lock against a **live** TTLock API call server-side (never trusts client-cached dropdown data) and enforces uniqueness (409 if a lock is already linked to another unit).

**Parking** — no dedicated Parking model, field, or route was found anywhere in the schema or API inventory. The task brief's implied "parking revenue"/"motorcycle vs car parking" pricing was searched for and not located. **Classification: Referenced But Not Found** (see [§38](#38-actual-vs-expected-functionality)).

**Management fee** — likewise, no dedicated "management fee" field/calculation was found in the pricing engine (`src/lib/pricing/rates.ts`) or Booking model. **Classification: Referenced But Not Found.**

---

## 5. Booking Management

**Model**: `Booking` (`prisma/schema.prisma:575-761`) — full field list: `id, unitId, date, checkOutDate, stayType, checkInTime, checkOutTime, guests (JSON string[]), pax, contactNumber, bookerId, cleanerId, platform, platformOther, dpAmount, dpReceivedById, dpMethod, dpProofUrl, amount, receivedById, method, proofUrl, paid, checkedInAt, checkedOutAt, guestId, specialRequest, cancelledAt, cancellationReason, cancellationCategory, refundedAt, refundReason, notes, source, externalUid, conflict, confirmationNumber, confirmationOverrideUntil, originalAmount, discountPct, paymentType, intendedDpAmount, paymentVerificationStatus, paymentVerificationNote, couponCode, couponDiscountAmount, createdAt, updatedAt`.

There is **no status enum column** — status is always derived (see [§6](#6-booking-lifecycle)). Unique constraint `[unitId, externalUid]` (Airbnb dedup key); indexes on `[unitId,date]`, `[date]`, `[unitId,checkOutDate]`, `bookerId`, `cleanerId`, `guestId`.

**Validation** (`bookingSchema`, `src/lib/validation.ts:22-72`) — required: `unitId`, `date` (valid date string), `stayType ∈ {Daycation,Night,Full,Flexible}`, `guests` (min 1), `contactNumber` (min 7 chars), `platform ∈ {Airbnb,TikTok,Facebook,WalkIn,Direct,Other}`, `amount` (a `moneyInt` schema that **rounds** a decimal instead of rejecting it — see [§34 issue 23](#34-historical-bugs--fixes)). `Flexible` additionally requires both `checkInTime` and `checkOutTime`, enforced in `createBookingCore()` rather than the schema (so a PATCH doesn't have to resend times for an unrelated edit). `normalizeStayTypeForPlatform()` forces `stayType = "Full"` whenever `platform === "Airbnb"` — enforced server-side on both create and edit.

**Creation** — single shared core, `createBookingCore()` (`src/lib/bookingService.ts:37-153`), called by both the staff form and the Guest Portal. Inside one `$transaction`: availability guard (throws `BookingConflictError` → HTTP 409 on conflict), atomic coupon-usage claim, then `tx.booking.create()`. After commit: `syncCalendarMirror()`, then `notify({type:"booking.created"})`. The manual-form route (`POST /api/bookings`) always overrides `bookerId` to the caller's own Employee record — a client-submitted `bookerId` is never trusted (the bulk Excel importer is the one exception, since it legitimately assigns different bookers per row). A role without `bookings.financial` action access has `body.paid` force-set to `false`. `waitUntil(createGuestAccessCode(...))` fires best-effort, non-blocking, for every manually-logged booking.

**Conflict / double-booking detection** — `checkAvailability()` (`src/lib/bookingEngine/availabilityService.ts:74-97`): queries other non-cancelled bookings on the unit within a padded window, then applies `bookingsConflict()` — a **real-timestamp** overlap check (`src/lib/stayRange.ts`), not a same-day/different-type heuristic (this exact heuristic was a confirmed historical bug, see [§34 issue 14](#34-historical-bugs--fixes)). Deliberately ignores housekeeping/cleaning status — a dirty room is still bookable.

**Edit** — `PATCH /api/bookings/[id]`: role/unit-scope checks, a Booker may only edit their own booking and cannot reassign `bookerId` away from themselves. `FINANCIAL_FIELDS` (`dpAmount, amount, paid, method,` etc.) are stripped server-side unless the caller has `bookings.financial` action access — this closed a real, confirmed-live gap where a Housekeeping session could set `amount: 999999` and `paid: true` via a direct API call. Re-runs the conflict check only if a conflict-relevant field actually changed. Fires `notify({type:"booking.updated"})` always, plus `{type:"payment.received"}` on a false→true `paid` transition (re-read fresh inside the transaction to avoid a duplicate-notification race — see [§34 issue 8](#34-historical-bugs--fixes)).

**Delete** (`DELETE /api/bookings/[id]`) — gated on `bookings.delete` action access (Bookers cannot; they must cancel). Fires `booking.cancelled` notification *before* the delete (guest lookup must still resolve), awaits access-code release (not fire-and-forget, since the FK must still exist), then deletes — the mirrored `CalendarBlock` cascades away automatically.

**Cancel** (`POST /api/bookings/[id]/cancel`) — atomic conditional update guards against a double-cancel race. Explicitly deletes the mirrored `CalendarBlock` (cancel does not delete the Booking row itself, so there's no cascade to rely on) — **net effect: a cancelled booking never appears on `/calendar`**. Does **not** touch `amount`/`dpAmount`/`paid` — money already collected is left as-is; commission eligibility is determined separately (see [§6](#6-booking-lifecycle)). `category ∈ {"guestCancelled","bookerConfusion","vipReassignment"}` — "Cancel" and "Remove" in the UI are the same endpoint, differentiated only by this field.

**Refund** (`POST /api/bookings/[id]/refund`) — gated on `bookings.financial` (a financial write, stricter than plain edit). Requires something was actually collected and not already refunded. Purely a factual flag — never touches `amount`/`dpAmount`/`paid`/`cancelledAt`. The **only** action that always zeroes commission eligibility, independent of everything else.

**Bulk import** — `POST /api/bookings/import` (Excel/CSV), template download at `GET /api/bookings/import/template`. Rounds/validates amounts (`Math.round(Number(amountRaw))`) at parse time (`src/lib/bookingImport.ts:215`).

---

## 6. Booking Lifecycle

There is genuinely **no status enum field** on `Booking`. Two independent derivation functions exist for two different audiences, and they can disagree at the margins:

**Staff-facing** — `lifecycleStatus(b, todayIso)` (`src/components/bookings/BookingsView.tsx:1240-1247`): returns `"cancelled" | "completed" | "active" | "upcoming"`.
```
cancelledAt set              → cancelled
checkedOutAt set              → completed
checkedInAt set OR (inIso ≤ today < outIso) → active
outIso ≤ today                → completed
otherwise                     → upcoming
```
`isPastDue(b)`: `!cancelledAt && !paid && checkIn date < today`.

**Guest-facing** — `guestJourneyStage(booking, now)` (`src/lib/bookingStatus.ts:32-54`): a finer 6-state union `before_stay | check_in_day | during_stay | checkout_day | completed | cancelled`, computed off real timestamps via `getOccupiedWindow()` rather than day-buckets.

**`checkedInAt`/`checkedOutAt`** — both nullable, purely additive. `checkedInAt` is set via `markCheckedIn()` in `BookingsView.tsx:725-735` → `PATCH /api/bookings/[id]` with `{checkedInAt: iso}`. **`checkedOutAt` has confirmed server-side support (the PATCH route accepts it and a real side effect — access-code release — depends on it) but no UI trigger for setting it was found anywhere in the codebase.** Flagged as a real gap — see [§11](#11-checkout) and [§35](#35-known-issues).

**`cancellationCategory`** distinguishes a real guest cancellation (`"guestCancelled"`, or legacy `null`) from a staff-initiated "Remove" (`"bookerConfusion"` | `"vipReassignment"`) — both share the same cancel endpoint.

**Commission eligibility** — `isCommissionEligible(booking)` (`src/lib/bookingStatus.ts:112-118`), the single formula reused everywhere commission is computed:
```
if (refundedAt) return false;
if (cancelledAt) return cancellationCategory === "guestCancelled" && (paid || dpAmount > 0);
return paid;
```
A non-cancelled paid booking always earns commission the moment it's paid (no waiting for checkout). A cancelled booking only earns commission if it was a genuine guest cancellation **and** money was kept. `bookerConfusion`/`vipReassignment` never earn commission regardless of payment. A refund always zeroes commission, independent of cancellation status.

`isBookingCompleted()` (`bookingStatus.ts:73-90`) is a **separate** gamification-only completion check (Elite Booker Challenge tiers), deliberately independent of commission eligibility.

---

## 7. Pricing

Fully implemented in `src/lib/pricing/rates.ts` and `src/lib/stayRange.ts`. **Rates are not hardcoded** — they live on the per-owner `Settings` model (`prisma/schema.prisma:1215-1238`) and are Admin-editable with no deploy required.

**Rate table defaults**: `weekdayRate12h: ₱1,499`, `weekdayRate21h: ₱1,699`, `weekendRate12h: ₱1,699`, `weekendRate21h: ₱1,899`, `weekdayNightPromoPct: 10`, `flexibleTimeFee: ₱150`, `dpFee: ₱500`.

**Stay types**: `Daycation`/`Night` price against the "12h" tier; `Full` prices against the "21h" tier. Weekend vs. weekday is decided **per night** via `isManilaWeekend()` (Fri/Sat/Sun in Asia/Manila = weekend), so a stay crossing a weekday→weekend boundary charges each night at its own rate. No per-unit rate variation — one flat table property-wide.

**`quotePrice(stayType, date, checkOutDate, rates, dpFee, checkInTime)`** (`rates.ts:79-111`):
- **10% weekday-night promo** applies only to `Night`-stay nights (or `Flexible` stays whose check-in time is ≥17:00, treated as "night-like") that land Mon–Thu. Daycation and Full stays are never discounted; weekend nights within a Night stay are never discounted.
- **Flexible surcharge** (`flexibleTimeFee`, ₱150) is a flat, once-per-booking fee, not per-night.
- `total = standardTotal - discountAmount + flexibleFeeAmount`.
- `splitDownPayment(total, dpFee)`: `dpAmount = min(dpFee, total)`, `balanceDue = total - dpAmount`. Reused by `applyCouponDiscount()` when a coupon is applied on top — coupon and promo are two distinct, stacked discount lines.

**Real occupied-window math** (`stayRange.ts`) — `getOccupiedWindow()` combines calendar date + `checkInTime`/`checkOutTime`, falling back to per-stay-type defaults when a time wasn't recorded:
```
Daycation/Flexible: 08:00–20:00, same day
Night/Full:         14:00–12:00, next day
Airbnb (any type):  14:00–11:00, next day
```
If the computed end ≤ start (a midnight-crossing Flexible case), the end rolls forward a day at a time until genuinely after the start. This is the same engine that powers double-booking conflict detection, calendar-mirror end dates, and (as of a bug fixed in this engagement) the Bookings-tab "Out" display.

**Coupons** (`src/lib/bookingEngine/couponService.ts`): `computeDiscount()` — `type:"percent"` → `round(subtotal × value / 100)`; anything else (`"fixed"`) → `min(value, subtotal)` (never discounts below zero). `checkCoupon()` looks up tenant-scoped (`code + ownerId`, closing a historical cross-tenant coupon-redemption bug), validates `active`/`expiresAt`/`maxUses` vs `usedCount`. **The code-review function itself never mutates `usedCount`** — the atomic claim happens inside `createBookingCore()`'s transaction. **Classification: Unknown/Not independently re-verified** whether that atomic claim is genuinely race-safe under concurrent redemption, since `bookingService.ts`'s exact `updateMany` guard wasn't re-read in this pass beyond the summary already cited.

---

## 8. Calendar

`CalendarBlock` model (`prisma/schema.prisma:819-848`) — `unitId, type, date, endDate, guest, note, status (default "confirmed"), bookingId (unique, 1:1 mirror, onDelete: Cascade), cleaningBookingId (unique)`.

**Sync** — `syncCalendarMirror()` (`src/lib/calendarMirror.ts:31-40`) is an upsert keyed on `bookingId`, called from both booking creation and every edit. `endDate` is computed from the real occupied-window's last-occupied-day, not a naive copy of `checkOutDate`. Separate helpers (`openCleaningCalendarBlock`/`closeCleaningCalendarBlock`/`clearCleaningCalendarBlock`) mirror housekeeping start/finish/reset as `type:"Cleaning"` blocks.

**Cancelled bookings**: explicitly deleted from `CalendarBlock` inside the cancel route (not relying on a cascade, since the Booking row survives) — a cancelled booking disappears from `/calendar` entirely, confirmed.

**Conflict visualization**: `Booking.conflict` (boolean) is set by the Airbnb iCal importer when an imported reservation overlaps an existing confirmed booking. **Confirmed via grep: `CalendarView.tsx` contains zero references to this field.** It is surfaced only as a "⚠ Conflict" tag on the Bookings-tab list view, never visually distinguished on the Calendar grid itself despite the data existing. Flagged in [§35](#35-known-issues).

---

## 9. Guest Management

**`Guest` model** (`prisma/schema.prisma`) — `email` (unique), `name`, `phone`, `emailNotifications`; has-many `Booking`, `GuestNotification`, `GuestRequest`, `FeedbackResponse`. Distinct auth system from staff `User` — see [§27](#27-authentication).

Every guest-scoped query (`getGuestBookingForGuide`, `getActiveGuideBooking`, etc.) is hard-scoped to `guest.id` — a guest can never enumerate or reach another guest's data by ID guessing.

**Guest requests** — `GuestRequest` model: `type ∈ {housekeeping, late_checkout, extend_stay, issue, other}`, optional photo, `priority ∈ {normal, high, urgent}`, `status`. Feeds the Dashboard's "Needs your attention" card for staff.

**Feedback** — `FeedbackResponse` (one per booking, `bookingId` unique) — a post-stay survey unlocking a one-time reward (`discount|late_checkout|coffee`); `discount` mints a real single-use `Coupon`. Optional `publicDisplayConsent` for a public review, shown only once admin-`approved`.

---

## 10. Check-In

The only confirmed check-in trigger is `markCheckedIn()` (`src/components/bookings/BookingsView.tsx:725-735`): optimistic local update, then `PATCH /api/bookings/[id]` with `{checkedInAt: iso}` via `fetchOrQueue` (offline-resilient — see [§25](#25-offline--pwa)). This immediately flips `lifecycleStatus` to `"active"` and advances `guestJourneyStage` to `check_in_day`.

**No TTLock action is directly tied to check-in** — the guest's door code is generated at booking **creation** time (or lazily on first sign-in via confirmation-number login for legacy bookings that predate that), not at check-in. Check-in is purely a bookkeeping timestamp.

**Required information / payment requirements at check-in**: none enforced specifically at check-in time beyond what's already required at booking creation — this app does not appear to gate check-in on full payment (a booking can be `"active"` while `paid: false`, surfaced instead via the `isPastDue` flag).

---

## 11. Checkout

**Confirmed server-side support, no confirmed UI trigger.** The PATCH route (`src/app/api/bookings/[id]/route.ts`) accepts `checkedOutAt` in its body and has a real downstream side effect (`waitUntil(releaseAccessCodeForBooking(booking.id))` fires when it's newly set). However, an exhaustive search of `src/components` and `src/app` found **no button, handler, or client call site that ever sends `{checkedOutAt: ...}`**. This means either: (a) checkout is never explicitly marked by staff in the current UI and the app instead infers "completed" purely from the checkout date/time passing (`lifecycleStatus`'s date-based fallback), or (b) a checkout UI action exists but wasn't discovered in this pass. **Classification: Partially Implemented** — the data model and side effects are real and correct; the triggering UI action could not be confirmed. This is the single most important gap to close before writing regression tests against a "mark checked out" workflow — see [§35](#35-known-issues).

**What IS confirmed to happen once a checkout is recognized** (whether via the missing explicit action or the date-based fallback):
- `lifecycleStatus` flips to `"completed"`.
- Housekeeping's "needs cleaning" signal activates — see [§12](#12-housekeeping).
- `releaseAccessCodeForBooking()` fires when `checkedOutAt` is set via PATCH (confirmed code path, trigger unconfirmed) — reserve codes return to `AVAILABLE`; real TTLock passcodes are deleted from the lock (best-effort).
- No automatic financial settlement occurs — an unpaid balance (`amount`) at checkout simply remains unpaid, surfaced via `isPastDue`.

---

## 12. Housekeeping

**`HousekeepingUnitState`** (`prisma/schema.prisma:852-890`, one row per unit) — `status` is exactly one of `todo | cleaning | clean`. Key fields: `byName`, `startedAt`/`endedAt`, `checked` (JSON `boolean[][]` checklist), `cleanedBookingIds` (JSON array, **accumulated never overwritten** — a unit can have 2+ checkouts in one day, e.g. an evening Daycation exit plus a separate Night exit; overwriting would silently re-mark an already-cleaned checkout as pending), `photoUrls` (staged for the current session, copied onto `CleaningLog` when finished), `overdueNotifiedAt` (dedup guard for the 2-hour overdue alert).

**`CleaningLog`** — permanent per-clean record, `bookingId` unique (a repeated "Mark clean" for the same checkout updates the same row rather than duplicating).

**Transitions** — `PATCH /api/housekeeping/unit/[id]`:
- `body.start` → `startedAt = now`, `overdueNotifiedAt = null`.
- `body.end` → `endedAt = now`.
- `status: "todo"` → full reset (`startedAt/endedAt/byName = null`, `cleanedBookingIds = []`, `photoUrls = []`).
- **Cancelled-booking guard**: rejects with 400 if the referenced `bookingId` is cancelled or belongs to a different unit — a direct API call with a cancelled booking's id used to still start a real cleaning cycle credited to it (fixed, see [§34](#34-historical-bugs--fixes)).
- Inside a `$transaction`: `cleanedBookingIds` is re-read **inside** the transaction (not before it) to avoid two near-simultaneous checkouts on the same unit racing to overwrite each other's append — a confirmed, reproduced-live historical bug.
- `Booking.cleanerId` is filled via `updateMany({where:{cleanerId:null}})` when a clean finishes with a `bookingId` — only if unset, crediting whoever actually clicked Finish (this feeds the Night Clean Bonus — was previously disconnected, see [§34](#34-historical-bugs--fixes)).

**Overdue rule**: `CLEANING_MAX_MS = 2 hours`. `checkOverdueCleanings()` runs opportunistically on every `GET /api/housekeeping` load (no dedicated cron slot exists) — no real-time watcher.

**Cancelled bookings and the schedule**: `src/app/housekeeping/page.tsx`'s schedule query filters `cancelledAt: null` — a confirmed-live historical bug (a cancelled booking generated a spurious "Cleaned" tile) is fixed at both the read path (never offered) and write path (rejected server-side even via direct API).

**Urgency tiers** (`HousekeepingView.tsx`'s `needsAttention` memo):
```
critical: another guest is checking into the SAME unit later today (real same-day turnover)
warning:  checked out >180 minutes ago, nobody has started
normal:   everything else pending
```
Sorted critical → warning → normal, then by checkout time.

**Housekeeping-specific access codes**: capped at 2-hour validity, requested on Start (`ensureHousekeepingCredentialOnStart`, HOUSEKEEPING role only), released on Finish. Falls back to the reserve pool if TTLock is down — this fallback was *deliberately absent* originally ("a cleaning code must never be permanent") until a real multi-day gateway outage made the no-fallback behavior the normal failure case rather than a rare edge case; the fix keeps the 2-hour session cap while allowing the underlying code source to be a permanent reserve code.

---

## 13. TTLock

**Files**: `src/lib/ttlock/client.ts` (raw API), `src/lib/ttlockSync.ts` (daily fallback sync), `src/lib/access/service.ts` (credential issuance/release — the only module allowed to write `AccessCredential` or call TTLock), `src/lib/access/eventSync.ts` + `eventClassifier.ts` (security event polling/classification), `src/app/api/webhooks/ttlock/[secret]/route.ts` (real-time battery push), `src/app/api/ttlock/**` (link/list/refresh/reserve-code routes).

**Endpoints actually called** (base `https://api.ttlock.com`, all with an 8-second timeout):
| Endpoint | Purpose |
|---|---|
| `POST /oauth2/token` | Fresh token minted on every call — no refresh-token caching (deliberate, to avoid stale-token bugs) |
| `POST /v3/key/list` | Lock listing — used instead of `/v3/lock/list` because the account only holds non-admin "common" ekeys, confirmed live that `lock/list` returns nothing |
| `POST /v3/keyboardPwd/add` | Both time-bounded passcodes (guest/housekeeping codes) and permanent passcodes (reserve-pool provisioning) |
| `POST /v3/lockRecord/list` | Real unlock/access history — **polled, not pushed**; TTLock has no webhook for unlock history on this account tier |
| `POST /v3/keyboardPwd/delete` | Passcode revocation |

**Auth env vars (names only)**: `TTLOCK_CLIENT_ID`, `TTLOCK_CLIENT_SECRET`, `TTLOCK_USERNAME`, `TTLOCK_PASSWORD` (MD5-hashed client-side before the token request). Webhook auth: `TTLOCK_CALLBACK_SECRET` (a URL path segment, since TTLock's callback config is a bare URL, not headers).

**Unit-to-lock mapping**: `Unit.ttlockLockId` (unique) + `ttlockLockName`, `ttlockHasGateway`, `ttlockBatteryPct`, `ttlockBatterySyncedAt`, `ttlockSyncError`, `ttlockBatteryReplacedAt`.

**Code generation & retry/fallback chain** (`src/lib/access/service.ts`):
- `withRetry()`: 3 attempts, exponential backoff (300/600/1200ms), records outcome into a singleton `TtlockStatus` row feeding the Dashboard's connection-health widget.
- `createGuestAccessCode()` never throws. Real TTLock passcode attempted first (`source: "ttlock"`); on failure after retries, falls back to `assignReserveCode()` (`source: "reserve"`, atomic compare-and-swap against the fixed 10-code-per-unit pool); on total failure (no lock linked AND pool exhausted), writes a `status: "FAILED"` credential for staff follow-up but **never blocks the booking**.
- `createEmergencyCredential()` (OWNER_ADMIN, 24h default) — this path previously had **no** fallback recovery at all; fixed after a documented real incident ("2026-08-10, 'The gateway is busy'") to also fall back to the reserve pool.
- `createHousekeepingCredential()` — see [§12](#12-housekeeping).
- Validity windows are computed from real check-in/out clock times (`getOccupiedWindow` → `manilaWallClockToRealInstant`), not midnight-anchored dates.

**Reserve codes / gateway-offline state**: `ReserveAccessCode` model, lifecycle `AVAILABLE → RESERVED → ACTIVE → AVAILABLE`. Dashboard health now distinguishes `exhaustedUnits` (pool run to zero) from `neverProvisionedUnits` (lock linked but zero reserve codes ever provisioned) — this second category is the direct code-level fix for a documented real incident where a unit's emergency-access button had nothing to fall back to because its pool was never provisioned in the first place; it is now a first-class Dashboard attention item rather than silently invisible. Provisioning (`POST /api/ttlock/reserve-codes/provision`) is admin-triggered only — never automatic/cron.

**Webhook** (`POST /api/webhooks/ttlock/[secret]`) — TTLock's real-time push whenever a gateway-connected lock uploads an unlock record. Auth via the path-segment secret. **Currently only updates battery telemetry** (`ttlockBatteryPct`, `ttlockHasGateway: true`, clears `ttlockSyncError`) — it does **not** populate a real unlock-history table (a code comment states this is intentionally deferred until that feature is designed). Always returns the literal string `"success"` regardless of internal outcome — a stated TTLock contract (they retry forever on any non-"success" response), not an oversight.

**Daily fallback sync** — `syncAllUnitLocks()`, piggybacked on the single daily cron slot (Hobby-plan constraint) alongside iCal import, Unsplash cache warming, security-event sync, and data retention. Also independently triggerable on-demand (`POST /api/ttlock/refresh`) via the identical function.

**Real access-event polling (security)** — `syncAccessEventsForUnit()` polls with a deliberately wide 48-hour lookback (wider than the actual poll cadence, so no event falls through a gap), matches plaintext `keyboardPwd` values against known credential codes, classifies severity, persists idempotently (`AccessEvent.ttlockRecordId` unique), and fires a staff notification + audit log entry on HIGH/CRITICAL classification.

**Error handling summary**: retries exist **only** in the credential-generation write paths. The read/sync paths (lock listing, access-record polling) have **no retry logic** — a single failure is recorded and the next scheduled/on-demand run tries again. Every call has an 8-second hard timeout.

---

## 14. Meter Reading

**Model**: `MeterReading` (`prisma/schema.prisma:1010-1062`) — `unitId`, `meterType (WATER|ELECTRICITY|UNKNOWN)`, `meterSubtype`, `photoUrl` (Blob, never base64), `readingValue`/`rawDisplay`/`readingUnit (m³|kWh)`, `readingConfidence`, `registerConfidence`, `imageQualityScore`/`Class`, `serialNumber`/`meterModel`/`accountNumber`, `digitAnalysis` (JSON per-digit confidence/alternatives), `previousReading`/`consumption` (server-computed, never client-suppliable), `anomalyDetected`/`Type`/`Explanation`, `integrityStatus (NORMAL|REVIEW_REQUIRED)`, `warnings`, `recommendedAction (AUTO_ACCEPT|MANUAL_REVIEW_REQUIRED)`, `rawResponse` (full model JSON kept verbatim), `loggedByName`.

**Pipeline**: select unit + meter type (`MeterReadingPanel.tsx`) → `MeterCaptureModal.tsx` (rear camera, `capture="environment"`) → immediate preview + scanning animation → `POST /api/housekeeping/meters/analyze` (multipart, unit-scope enforced, MIME/size validated, 10MB cap) → server fetches the *actual* previous reading for the same unit+meterType from the database (never trusted from the client, closing a spoofing vector) → uploads to Blob and base64-encodes the image in parallel → `analyzeMeterPhoto()` calls Gemini (`gemini-3.1-pro-preview`, `responseMimeType: application/json` + a strict `responseSchema`) → result re-validated with a Zod schema as defense-in-depth beyond the schema-constrained generation → **the reading is always persisted regardless of `recommendedAction`** (both AUTO_ACCEPT and MANUAL_REVIEW_REQUIRED reach the same `create()` call — "needs review" is a display/audit flag, not a save-gate) → audit-logged.

**AI decision protocol** (`src/lib/meterReadingPrompt.ts`, a 14-step spec): image-quality scoring, register localization (never assume the largest number is the reading), water-vs-Meralco-specific rules, digit-by-digit confidence with alternatives, perspective correction without fabrication, historical-consumption validation (flags `POSSIBLE_READING_ERROR_OR_METER_ROLLOVER` on a decrease rather than assuming it's real), fraud/tamper flagging, and an explicit human-review trigger list: reading confidence <90, any digit <80, register-localization confidence <85, image quality <70, multiple candidates, historical conflict, integrity concerns, or unidentifiable type/unit. The AUTO_ACCEPT/MANUAL_REVIEW decision is made **by the model per this prompt**, not separately recomputed by application code.

**Monthly aggregation** (`GET /api/housekeeping/meters/monthly`) — sums `MeterReading.consumption` grouped by unit + meterType for the current and previous calendar month side by side (one round trip for a % delta), plus `anomalyCount`. Rendered as an animated bar chart in `MeterMetricsPanel.tsx`.

**Missed-target alarm** — `meterReadingTargetDay()`: target days are the 1st of the month ("Monthly billing cycle") and every Monday ("Weekly Monday check"). Two-part alarm:
- **Live, same-day**: a Housekeeping-view banner listing unit/meterType pairs not yet logged today (never claims "missed," only "not done yet").
- **Persisted, checked yesterday** (`checkMissedMeterReadingTargets()`, run opportunistically on page load, same "no cron slot" discipline as the overdue-cleaning check): if yesterday was a target day, diffs missing unit/meterType pairs and fires a `StaffNotification` — deliberately checks *yesterday* not *today*, since today still has hours left and there's no defensible same-day "too late" cutoff. Dedup is done by string-matching "Water"/"Electricity" in the notification's own message text (no dedicated schema column).

---

## 15. Finance

All financial calculations funnel through two shared, genuinely-reused libraries: `src/lib/finance.ts` (money in centavos internally, converted only at display) and `src/lib/payroll.ts`. Two independent pipelines both call these primitives but combine them differently — this is a deliberate design distinction, not a bug, and is called out explicitly so a reader doesn't assume "Net Profit" means one universal thing app-wide.

### Dashboard pipeline (`useMonthlyProfitSummary.ts`)
- `monthIncome` = Σ `collectedAmountPesos(b)` for bookings dated this month, where `collectedAmountPesos = refundedAt ? 0 : (paid ? amount : 0) + (dpAmount||0)`.
- `completedMonthIncome` = same, filtered to stays that have actually finished — this feeds **Net Profit**.
- `expectedMonthIncome` = Σ full contract value (`amount+dpAmount`) excluding cancellations — feeds **Forecast**.
- **Payroll is accrued day-by-day through the month**, not deducted in full on day 1 (`accruedStaffSalary` vs `upcomingStaffSalary`).
- **Net Profit** = `revenue(completedMonthIncome) − paidExpenses − (accruedStaffSalary + TikTokAds + approvedExpenseRequests)`, **floored at ₱0 for display** (a real loss period never shows negative, though the raw negative value still drives "caution" UI styling).
- **Margin** = `netProfit / completedMonthIncome`, also floored at 0.
- **Cash Flow** = same formula as Net Profit but revenue is `monthIncome` (not gated on stay-completion) — "money that's actually moved."
- **Forecast Profit** = a projection using `expectedMonthIncome`, bills *due* (not yet paid), and *upcoming*/pending costs.

### Analytics pipeline (`getExecutiveKPIs`, `src/app/analytics/queries.ts`)
- **Revenue**: `collectedRevenueCentavos()` — same paid+dp-minus-refund rule, in centavos. Has a **historical-fallback substitution**: for an exact calendar month with ≤₱0 tracked revenue, the headline total substitutes `AirbnbEarningsMonth`'s self-reported figures — this substitution affects **only** the headline total, never Net Profit/RevPAR/growth%, which always use the raw tracked figure.
- **MTD figures** use `elapsedBookings()` (bookings dated before `min(periodEnd, now)`) for apples-to-apples period comparison, distinct from the full nominal-period total.
- **Net Profit** = `rawRevenue − paidExpenses − accruedOperationalCosts` (same accrued-payroll+ads+approved-requests formula, generalized to an arbitrary period, internally clamped so future days are never charged).
- **Margin** is a percentage-**point** delta vs. the prior period (deliberately not a growth-%, to avoid "up 2.3%" ambiguity), **not floored at 0** here (unlike the Dashboard's display version).
- **Occupancy** (`computeOccupancy`, `src/lib/analytics/occupancy.ts:46-103`): counts unique `(unit, calendar-day)` pairs actually occupied — deduplicated so a Daycation + Night stay sharing a real day on the same unit only counts once (this exact double-count was a confirmed historical bug). `availableNights = unitCount × daysInPeriod − maintenanceNights` (only Maintenance blocks reduce availability; Cleaning blocks do not — standard PMS convention). `occupancyPct = round(occupiedNights / availableNights × 100)`.
- **ADR** = `round(totalRevenueCentavos / totalNights / 100)` — revenue excludes refunded bookings, but the night still counts as occupied (the room was used regardless of refund).
- **RevPAR** = `round(revenueCentavos / availableNights / 100)` — actual period length, not a hardcoded `/7`.
- **Forecast** (`trailingAverageForecast`) — a plain trailing-3-period average, explicitly documented as "no external stats library, no black-box model." `confidence: "medium"` only with ≥3 prior periods, else `"low"`.
- **Growth %** returns `null` (never a fabricated 0%/∞%) if the previous period was ≤0.
- **Gross vs. Collected Revenue** — `grossRevenueCentavos` (full contract value) vs. `netRevenueCentavos` (money actually in hand) are deliberately distinct figures, after a confirmed historical bug where using bare `amount` for "gross" could read *higher* than "net" for the same bookings.

### Payroll (`src/lib/payroll.ts`)
- `isPayrollRole(role)` = `HOUSEKEEPING | BOOKER | AUDITOR` only.
- `monthlySalaryFromRate`: `DAILY → round(rate×365/12)`, `WEEKLY → round(rate×52/12)`, `MONTHLY → unchanged`. This is the canonical stored figure every period-scaled calculation reads.
- `effectiveMonthlySalary()` reads the most recent `SalaryHistory` entry at-or-before the query date — editing today's rate never rewrites past reports.
- **Housekeeping Night Clean Bonus** (real rule): a cleaning qualifies if its booking's check-in time is ≥17:00 AND that day's total portfolio cleanings (all housekeeping staff combined) exceed the total unit count (i.e., at least one unit turned over more than once that day). Bonus pool is capped per-day so it can't exceed the real number of "extra" cleanings. Default ₱300/qualifying clean. A legacy fallback formula exists when portfolio-wide data isn't supplied.
- **Justine's carve-out** — `Employee.fixedSalaryCoversCleaning`: when true, the "Regular pay" line is skipped entirely (fixed salary already covers day-to-day cleaning); only the Night Clean Bonus still shows as extra activity income.
- **Booker commission**: flat ₱100/booking (`Settings.bookerCommission`, admin-configurable), **not percentage-based**, applies to whoever is `bookerId` on an eligible booking (per `isCommissionEligible`, [§6](#6-booking-lifecycle)) regardless of their primary role.

---

## 16. Expenses

**Cash-based accounting, strictly.** An expense only affects Net Profit/Margin/Cash Flow **once actually paid** — creating, scheduling, or marking Pending/Due/Overdue never reduces any financial metric.

- **`Bill`** (the largest expense model) — a boolean `paid` field only, no richer status enum; any UI label ("Scheduled"/"Due"/"Overdue") is a pure display-layer derivation from due-date, synonymous with "unpaid" for every financial computation. `pendingExpensesCentavos` (unpaid bills) is explicitly documented as "informational only, must never be subtracted from profit/cash-flow."
- **`RecurringExpenseTemplate`** — source of truth for auto-generating monthly `Bill` instances (unit-specific or global, `unitId` nullable).
- **`WeeklyExpense`** — an ad-hoc cost, optionally charged against a specific staff member's collected total (`targetEmployeeId`); `TIKTOK_ADS` category has no paid/unpaid concept at all — it's treated as immediately realized the moment it's logged.
- **`ExpenseRequest`** — employee-submitted, has a real pending/realized split: only `APPROVED` rows count toward Realized costs; `PENDING` rows feed only the Forecast figure, never Realized/Net Profit; `REJECTED` never counts anywhere.
- Payroll itself has **no paid/unpaid flag** — always treated as accrued day-by-day through the period, a deliberately different model from Bill's binary gate.

---

## 17. Dashboard

See [§15](#15-finance) for the exact formulas behind every metric named below; this section covers what's on screen. Confirmed data-fetching functions: `fetchKpiData`, `fetchRevenueData`, `fetchBookingData`, `fetchOccupancyData`, `fetchHousekeepingData`, `fetchStaffData`, `getDashboardData` (`src/app/dashboard/page.tsx`, `src/app/analytics/queries.ts`). Cards confirmed present: Net Profit, Margin, Cash Flow, Forecast Profit, Revenue, Occupancy, ADR, RevPAR, staff/payroll summary, TTLock connection health, reserve-code exhaustion alerts, "Needs your attention" (guest requests, upcoming check-ins at risk of an offline/low-battery lock).

A consolidated **"All Staycations"** cross-property view exists at `/dashboard/consolidated` for users with `OwnerAccess` to more than one tenant.

---

## 18. Staff

See [§28](#28-authorization) for the complete role/permission matrix. Every staff role's dashboard/earnings/tasks/restrictions are derived directly from the RBAC functions in `src/lib/rbac.ts`, `src/lib/actionAccess.ts`, and `src/lib/pageAccess.ts` — not inferred from role names.

---

## 19. Booker

- **Ownership**: `Booking.bookerId` → `Employee`. A Booker's own visible booking set is filtered to `bookerId === ownEmployeeId` (`isBookerView` in `BookingsView.tsx`).
- **Creation**: server always overrides a client-submitted `bookerId` to the caller's own Employee record on the manual-form path (never trusted).
- **Commission/earnings**: see [§15](#15-finance).
- **Dashboard/leaderboard/achievements**: see [§20](#20-gamification).
- **Team/group logic**: `Employee.teamKey` — three hardcoded teams (`A`/`B`/`C`, `src/lib/constants.ts`'s `TEAMS`, a config constant not a DB model). Teammates are same-`teamKey` + same-`ownerId` Employees; team stats = commission-eligible booking count + collected revenue across all teammates for the current calendar month. **No team-level payout/reward formula was found beyond this display** — team performance is shown, not separately rewarded. Classified Partially Implemented.

---

## 20. Gamification

**Elite Booker Challenge** — `src/lib/gamification.ts`, company-wide (per-tenant, not per-unit), monthly, with **limited winner slots per tier**:

| Tier (completed bookings) | Reward | Slots | Badge |
|---|---|---|---|
| 50 | ₱500 | 2 | 🥉 Bronze Booker |
| 100 | ₱1,500 | 2 | 🥈 Silver Booker |
| 150 | ₱2,500 | 2 | 🥇 Gold Booker |
| 200 | ₱3,500 | 1 | 💎 Platinum Booker |
| 250 | ₱5,000 | 1 | 👑 Legend Booker |

Eligible roles: `BOOKER`, `HOUSEKEEPING`. `syncEliteBookerAwards(ownerId)` groups completed (non-cancelled, `isBookingCompleted()`-true) bookings by `(bookerId, month-of-check-in)`, ranks by real completion timestamp ascending, and — for each tier — the first N employees to cross the threshold win. Winners are upserted into `EliteBookerAward` keyed on `(employeeId, month, tier)`, **permanently**: an award, once persisted, is never revoked or reassigned even if a later recompute would produce a different ranking.

**There is no explicit monthly reset job/cron.** This function runs live/inline on every leaderboard or My Earnings read. The "reset" is implicit: the month key changes and prior months' awards simply stay untouched while a new month accumulates fresh under a new key.

**`EmployeeAchievement`** — owner-configurable per-employee badges (`{label, threshold, rewardAmount, personalMessage}`), seeded with 3 defaults on first fetch ("First Booking" @1, "10 Bookings" @10, "25 Bookings" @25). "Unlocked" is computed live (never stored) as `lifetimeCompletedCount ≥ threshold`.

---

## 21. Guest Experience

Full detail in [§27](#27-authentication) (auth mechanism) and here for capabilities. A guest CAN: view their bookings, cancel a booking, upload payment proof (Gemini-vision-verified), submit a `GuestRequest`, submit post-stay `FeedbackResponse` (unlocking a one-time reward, optionally a real single-use `Coupon`), view an in-app notification inbox, chat with an AI concierge, browse the digital guidebook (WiFi/door-code/check-in-instructions/amenities/house-manual/location/nearby-places/FAQs/emergency-contacts/gallery/reviews), and reveal WiFi/door-code on demand (bounded by stay validity, not re-requiring the confirmation number once signed in).

A guest CANNOT: make a direct payment (no payment-processing integration exists — only proof-of-payment upload), see any other guest's or unit's data, reveal a housekeeping-type access credential, or self-serve past the stay's validity window (the email magic link is the sole always-available fallback once a code-based login expires).

**Staff QA exception**: `/admin/view-as-guest/[bookingId]` lets an `OWNER_ADMIN` preview the exact guest-facing WiFi/door-code reveal for one specific real booking, scoped strictly to that booking id.

---

## 22. Booking Sources

**`platform` enum** (guest's booking channel, editable): `["Airbnb", "TikTok", "Facebook", "WalkIn", "Direct", "Other"]` (`src/lib/constants.ts`'s `PLATFORMS`; `PLATFORM_LABEL` only overrides `WalkIn → "Walk-in"`). `platformOther` is free text for `"Other"`.

**`source` field** (strictly binary provenance): `"MANUAL"` (default) vs `"AIRBNB"` (set by the iCal importer). These are independent — a manually-entered booking with `platform: "Airbnb"` (staff logging an Airbnb guest by hand) still has `source: "MANUAL"`. The "Airbnb import" tag on the Bookings list is keyed on `source`, separate from the platform pill.

---

## 23. Airbnb / iCal

**Cron**: `vercel.json` — `{"path": "/api/ical/cron", "schedule": "0 18 * * *"}`, daily at 18:00 UTC. This single Hobby-plan slot is shared/piggybacked by five jobs run sequentially: Airbnb sync, TTLock lock sync, Unsplash cache warming, security-event sync, data-retention pruning. Auth via `CRON_SECRET` (Bearer header from Vercel, or `?secret=` query param for manual/local testing).

**Revenue estimate**: Airbnb's `.ics` export carries no price. `AIRBNB_NIGHTLY_RATE = ₱1,495` (fixed constant) × real occupied nights.

**Real-reservation filtering**: only imports events where `!cancelled && uid && summary.trim().toLowerCase() === "reserved"` — anything else (a host block, another synced calendar's unavailable dates) blocks the date only, with no guest/no revenue.

**Duplicate detection**: `Booking.externalUid` = the `.ics` event UID. Any previously-imported booking whose UID is no longer present in the current feed is deleted (stale-row cleanup).

**Broken/unreachable feed handling**: one retry on fetch failure (15s timeout). Persistent failure → `Unit.icalLastSyncError` is set and stays set (visible to staff) until a sync succeeds, at which point it's explicitly cleared. Every sync (auto or manual) writes an `IcalSyncLog` row surfaced via a Sync History panel.

**Double-booking prevention** (`overlapsManualTx`) — the sync loop's overlap snapshot can go stale mid-run since events process sequentially with real time elapsing between them; every actual write re-checks a **live** view inside its own transaction immediately before writing. A rejected/conflicting import is never silently dropped — the existing booking gets `conflict: true` and is retried on every subsequent sync until resolved.

**Export side** (`GET /api/ical/[token]`) — publishes this app's own **non-cancelled** confirmed bookings as `SUMMARY:Reserved` events, secured by an unguessable per-unit token plus a best-effort per-instance rate limiter (30 req/60s per IP+token, explicitly documented as not a hard cross-instance guarantee on serverless).

---

## 24. Notifications

**Guest-facing** (`GuestNotification`, via `notify()`) — 6 defined event types, but **only 4 are ever actually triggered**:

| Event | Triggered? | Trigger site |
|---|---|---|
| `booking.created` | ✅ Yes | Booking creation |
| `booking.updated` | ✅ Yes | Any PATCH edit |
| `booking.cancelled` | ✅ Yes | Cancel, or Delete |
| `payment.received` | ✅ Yes | `paid` flips false→true |
| `checkin.reminder` | ❌ **Never** | Defined with message text, zero callers found anywhere |
| `checkout.reminder` | ❌ **Never** | Defined with message text, zero callers found anywhere |

Dedup: a 60-second window per `(guestId, type, bookingId)` suppresses genuine near-duplicates without suppressing legitimate later recurrences. No-op for bookings with no `guestId` (staff-logged bookings never generate a guest notification).

**Staff-facing** (`StaffNotification`, via `notifyStaff()`) — 10 defined event types, **1 confirmed never triggered** (`code.expiring` — defined, zero callers), the other 9 confirmed real: `cleaning.started`, `cleaning.late`, `cleaning.overdue`, `cleaning.completed`, `code.generated`, `code.copied`, `employee.autologout`, `security.unauthorized_access`, `meterReading.missed`. Targeting: every active `OWNER_ADMIN`, plus any `CO_OWNER` whose portfolio includes the event's unit, plus the specific booker if given.

**Confirmed gap, still present as of this pass**: `GET/PATCH /api/staff-notifications` is a fully working API (list, unread count, mark-read) with real writes from `notifyStaff()` — but an exhaustive search found **zero UI components anywhere that fetch or display it**. No bell icon, no badge, no inbox screen. By contrast, `GuestNotification` **is** rendered (`/notifications` page exists). This is a real, confirmed, currently-live gap — see [§35](#35-known-issues).

**Push notifications**: `public/sw.js`'s `push`/`notificationclick` handlers are explicit empty stubs with a comment stating they're intentionally not wired to anything yet (future FCM/OneSignal integration point).

---

## 25. Offline / PWA

**Service worker** (`public/sw.js`, hand-rolled, no Serwist/Workbox): static Next.js build assets are cache-first (safe, content-hashed); a **GET-only allowlist of exactly 3 endpoint families** (`/api/housekeeping`, `/api/bookings`, `/api/calendar`) is network-first with cache fallback; page navigations are network-first falling back to a static `/offline` page only on genuine failure (deliberately not cache-first, so server-side auth redirects in middleware still run whenever the network is actually up).

**Offline mutation queue** (`src/lib/offlineQueue.ts`) — lives in app code, not the service worker, because Background Sync API doesn't exist in iOS Safari (a stated hard requirement). Mutations persist to IndexedDB and flush on an `online` event or visibility change. **Confirmed actual callers — the complete list, no others exist**:
1. `PhotoCapture.tsx` → `POST /api/housekeeping/photos` (cleaning-session photo upload).
2. `HousekeepingView.tsx` → `PATCH /api/housekeeping/unit/{id}` (cleaning status updates).
3. `BookingsView.tsx` → `PATCH /api/bookings/{id}` (`markCheckedIn`).

**Everything else — booking create/edit/cancel/refund forms, Admin, Analytics, and all guest-facing flows — is a plain `fetch` with no offline queuing.** Offline support is real but narrow: specifically Housekeeping's photo/status updates and the check-in action, not a general offline-mutation layer. The IndexedDB queue is explicitly cleared on sign-out (it's device-scoped, not user-scoped — otherwise a mutation queued under one staff member could replay under whoever signs in next on the same device).

**Manifest**: dynamically generated (`src/app/manifest.ts`, per-owner business name), `display: "standalone"`, icons at `192`/`512` with `purpose: "any"` only (no `maskable` variant — several real install paths rendered the maskable safe-zone padding as a visible border, per the code comment). No static `manifest.json` file exists.

---

## 26. Mobile / Responsive

Standard Tailwind breakpoints, no custom scale, mobile-first throughout (per `docs/Responsive-Design.md`, spot-checked and confirmed accurate against `BottomNav.tsx`/`Navbar.tsx` for this pass). Two navs, never both visible: `BottomNav` (`md:hidden`) for mobile, `Navbar`'s staff-item row (`hidden md:flex`) for tablet/desktop.

**Confirmed mobile-specific camera capture** (`capture="environment"`, opens the rear camera directly rather than a generic file picker): `PhotoCapture.tsx` (housekeeping cleaning photos) and `MeterCaptureModal.tsx` (meter reading photos). Modals are full-screen on mobile, centered dialogs on larger screens. Bookings is card-based at every breakpoint (never a `<table>`); other data-heavy staff pages generally collapse a table to cards below `md`.

This section's content beyond the two directly-verified `capture="environment"` sites and the nav breakpoint spot-check is sourced from the pre-existing `docs/Responsive-Design.md`, not independently re-derived line-by-line in this pass — flagged per this document's own confidence-labeling standard.

---

## 27. Authentication

**Two entirely separate, parallel systems** — staff and guests never share a session/cookie/code path.

### Staff (`src/lib/auth.ts`, NextAuth JWT strategy)
- Single `CredentialsProvider` (username/password, bcrypt). No OAuth.
- `authorize()`: rate-limited 10 attempts/15min per username; blocks sign-in if the owner is `SUSPENDED`; on success, resolves the effective session using `lastActiveOwnerId` if it differs from home `ownerId` and that grant is still valid.
- **`jwt()` token shape**: `id, username, role, ownedUnitIds, ownerId, isPlatformAdmin, additionalPageAccess, additionalActionAccess, ownerBusinessName/LogoUrl/EnabledModules, colorTheme, mustChangePassword`, plus impersonation fields when active.
- **Profile-push**: `trigger==="update"` (not impersonation) lets the client push name/email/avatarColor/theme live without re-login.
- **Impersonation**: `OWNER_ADMIN` only, cannot target another `OWNER_ADMIN` or an inactive user, cannot self-impersonate, tenant-boundary enforced (cross-tenant returns 404, not 403, to avoid confirming existence). Snapshots the real admin into `token.realUser`; a 30-minute sliding inactivity timeout (re-signed on every request, enforced in `middleware.ts`) force-stops it; logging out while impersonating also force-stops it.
- **`__switchOwner` (multi-staycation switch)**: validates the `OwnerAccess` grant and that the target owner is `ACTIVE` — re-validated independently inside the `jwt()` callback itself, which is the layer that actually enforces the boundary (the API route's own check is only for a clean error message). Persists `lastActiveOwnerId` for next login, **except while impersonating** (deliberately — that's the admin's temporary view, not the real target's preference).
- **60-second background revalidation**: refreshes `isPlatformAdmin`, `additionalPageAccess/ActionAccess`, `colorTheme`, and re-derives `ownerId/role/ownedUnitIds`/branding from the matching `OwnerAccess` row (falling back to the home owner if the active one is no longer valid) — **every 60 seconds**, skipped entirely while impersonating. Does **not** refresh `name/email/avatarColor/mustChangePassword` — those only change via the explicit profile-push branch. This 60-second window is also what makes access revocation or an owner going `SUSPENDED` take effect without forcing a logout.

**`src/middleware.ts`**: role-gates `/dashboard`, `/analytics`, `/bookings`, `/calendar`, `/housekeeping`, `/auditor`, `/admin` (actual enforcement is `effectivePageAccess()`, not the raw role map). Force-redirects to `/change-password` on `mustChangePassword`. Maintenance-mode redirect for non-`OWNER_ADMIN` roles on any matched staff route (edge-cached 15s TTL, fail-open). Guest routes are **not** in the middleware matcher at all — they self-gate via `getCurrentGuest()`.

### Guest (`src/lib/guestSession.ts`)
- Own cookie (`guest-session-token`, httpOnly, 30-day maxAge), own secret (`GUEST_SESSION_SECRET`), reusing `next-auth/jwt`'s encode/decode purely as a JWT utility — not a real NextAuth session.
- **Email magic link**: rate-limited (10/hr per IP, 5/hr per email), 15-minute token TTL, always returns `{ok:true}` regardless of outcome (no email-enumeration signal). The permanent fallback regardless of stay/booking age.
- **Confirmation-number-only login**: no email required, relies on confirmation-number entropy (~729M combinations) plus rate limiting (15/hr per IP, 120/hr global). Stay-scoped via `isConfirmationValid()` — stops working once the stay window passes (unlike the email link). Auto-bootstraps a placeholder `Guest` account for staff-logged/Airbnb-imported bookings that never had one, and lazily creates a door-access credential if missing.

---

## 28. Authorization

**`src/lib/rbac.ts`** — every exported permission function's exact return:

| Function | Allowed roles |
|---|---|
| `canSeeDashboard` | OWNER_ADMIN, CO_OWNER |
| `canSeeAnalytics` | OWNER_ADMIN, CO_OWNER |
| `canSeeAdmin` | OWNER_ADMIN only |
| `canSeeAuditor` | OWNER_ADMIN, AUDITOR, CO_OWNER |
| `canSeeHousekeeping` | OWNER_ADMIN, CO_OWNER, HOUSEKEEPING |
| `canSeeBookings` | everyone except AUDITOR |
| `canSeeSocialMedia` | everyone (always true) |
| `canManageUnits` | OWNER_ADMIN only |
| `canEditBookings` | OWNER_ADMIN, CO_OWNER, BOOKER, HOUSEKEEPING |
| `canEditSpecificBooking` | as above, but a BOOKER only their own booking (Airbnb-platform bookings have no bookerId, open to all Bookers) |
| `canDeleteBookings` | `canEditBookings` minus BOOKER |
| `canEditHousekeeping` | OWNER_ADMIN, HOUSEKEEPING |
| `canAddHousekeepingStock` | OWNER_ADMIN only (narrower than editing — Housekeeping can adjust counts but not add new items) |
| `isReadOnlyFinancials` | AUDITOR, HOUSEKEEPING |
| `canRevealAccessCredential` | OWNER_ADMIN, CO_OWNER, BOOKER |
| `canRevokeAccessCredential` | OWNER_ADMIN, CO_OWNER |
| `canGrantEmergencyAccess` | OWNER_ADMIN only |
| `canViewAccessHistory` | OWNER_ADMIN, CO_OWNER, AUDITOR |
| `canGrantHousekeepingAccess` | OWNER_ADMIN, BOOKER (explicitly not CO_OWNER, unlike `canRevealAccessCredential`) |
| `unitScope` | `"all"` for every role except CO_OWNER, which returns their explicit `UnitOwner` array |

**Granular action-access override** (`src/lib/actionAccess.ts`) — `MemberActionAccess` model, additive-only (no explicit-deny), 6 grantable actions scoped to Bookings + Housekeeping: `bookings.create/edit/delete/financial`, `housekeeping.edit/financial`. `hasActionAccess()`: `OWNER_ADMIN` always true; otherwise role-default OR explicit grant.

**Page-level access** (`src/lib/pageAccess.ts`) — `effectivePageAccess(role, additionalPages, enabledModules)`: role defaults unioned with per-user `MemberPageAccess` grants, then **intersected** with the tenant's `Owner.enabledModules` ceiling (a per-tenant feature-tier limit that can even restrict OWNER_ADMIN on a newly-created tenant; `null` = unrestricted). This single resolver is shared by nav rendering, middleware's route guard, and the Access Management screen — "so they can never quietly disagree" per the code comment.

**Platform Admin** (`User.isPlatformAdmin`, orthogonal to `role`) — grants only cross-tenant `/platform/**` routes (create/suspend Owners, cross-tenant staff listing, grant `OwnerAccess`), never "see everyone" on the regular business UI.

---

## 29. Database Models

50 models total, confirmed via full schema read. Grouped by domain:

**Core tenant/user/access-control**: `Owner`, `User`, `OwnerAccess`, `MemberPageAccess`, `MemberActionAccess`, `UnitOwner`, `Employee`, `SalaryHistory`, `AccessCredential`, `ReserveAccessCode`, `AccessEvent`, `TtlockStatus`.

**Booking/calendar**: `Unit`, `Booking`, `BookingMigrationRecord`, `AirbnbEarningsMonth`, `CalendarBlock`, `IcalSyncLog`.

**Housekeeping/operations**: `HousekeepingUnitState`, `CleaningLog`, `Shift`, `Stock`, `Bill`, `RecurringExpenseTemplate`, `MeterReading`, `AuditFinding`.

**Laundry** (Housekeeping sub-module): `LaundryService`, `LaundryOrder`, `LaundryItem`, `LaundryStatusHistory`, `LaundryPayment`.

**Finance/payroll**: `WeeklyExpense`, `ExpenseRequest`, `EliteBookerAward`, `EmployeeAchievement`, `Coupon`.

**Guest experience**: `Guest`, `GuestRequest`, `GuestNotification`, `GuestLoginToken`, `FeedbackResponse`, `AssistantEscalation`, `PlaceInsight`, `UnsplashImageCache`.

**Notifications/system**: `StaffNotification`, `AuditLog`, `ImpersonationSession`, `DismissedAttentionItem`, `DeploymentEvent`, `Settings`.

Full per-model field/relation detail was gathered and is available on request — omitted here for length; every model above was independently confirmed present via `grep -c "^model " prisma/schema.prisma` (= 50) cross-checked against a full line-by-line read.

---

## 30. API Inventory

145 route files under `src/app/api/**/route.ts`, confirmed exhaustively (not sampled). Grouped by feature area — method column reflects actually-exported HTTP handlers, not assumed REST conventions.

### Auth
| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET,POST | NextAuth handler |
| `/api/guest/auth/request-link` | POST | Guest magic-link request |
| `/api/guest/auth/verify` | GET | Magic-link verification |
| `/api/guest/auth/verify-confirmation` | POST | Confirmation-number login |
| `/api/guest/auth/signout` | POST | Clear guest cookie |

### Admin / Deployment / Platform
| Route | Methods | Purpose |
|---|---|---|
| `/api/admin/deployment` | POST | Create a maintenance/deployment notice |
| `/api/admin/deployment/[id]` | PUT,DELETE | Deployment lifecycle transitions |
| `/api/admin/deployment/history` | GET | Past deployment events |
| `/api/admin/impersonate/start` | POST | Validate + begin impersonation |
| `/api/admin/impersonate/force-stop` | GET | Timeout redirect target |
| `/api/admin/run-access-migration` | POST | One-time AccessCredential migration |
| `/api/admin/unsplash/refresh` | POST | Manual Unsplash cache warm |
| `/api/deployment/status` | GET | Polled by DeploymentBanner |
| `/api/deployment/maintenance-flag` | GET | Unauthenticated maintenance boolean |
| `/api/platform/owners` | GET,POST | List/create tenants |
| `/api/platform/owners/[id]` | PATCH,DELETE | Edit tenant / suspend |
| `/api/platform/owners/[id]/staff` | POST | Create a separate staff login at an owner |
| `/api/platform/owners/logo` | POST | New-owner icon upload |
| `/api/platform/owner-access` | POST | Grant OwnerAccess |
| `/api/platform/staff` | GET | Cross-tenant staff list |
| `/api/staycations` | GET | This user's switchable owners |
| `/api/staycations/switch` | POST | Switch active staycation |

### Bookings / Calendar / iCal
| Route | Methods | Purpose |
|---|---|---|
| `/api/bookings` | GET,POST | List/create |
| `/api/bookings/[id]` | PATCH,DELETE | Edit/hard-delete |
| `/api/bookings/[id]/cancel` | POST | Soft cancel |
| `/api/bookings/[id]/confirmation` | POST | Reactivate/reissue confirmation number |
| `/api/bookings/[id]/refund` | POST | Mark refunded |
| `/api/bookings/availability` | GET | Availability + alternatives |
| `/api/bookings/check-conflict` | GET | Live form conflict check |
| `/api/bookings/import` + `/template` | POST / GET | Bulk import |
| `/api/calendar` | GET,POST | List/create blocks |
| `/api/calendar/[id]` | PATCH,DELETE | Edit/delete block |
| `/api/ical/[token]` | GET | Public per-unit export feed |
| `/api/ical/cron` | GET | Daily scheduled import |
| `/api/ical/sync-all` | POST | Manual full sync |
| `/api/ical/sync-history` | GET | Sync log |
| `/api/units/[id]/ical-sync` | POST | Manual per-unit sync |
| `/api/units/[id]/ical-regenerate` | POST | Regenerate export token |

### Housekeeping / Laundry / Meters
| Route | Methods | Purpose |
|---|---|---|
| `/api/housekeeping` | GET | State list + overdue check |
| `/api/housekeeping/unit/[id]` | PATCH | Start/finish/reset/checklist |
| `/api/housekeeping/photos` | POST | Cleaning photo upload |
| `/api/housekeeping/shift` | GET,PATCH,POST | Clock in/out |
| `/api/housekeeping/stocks` + `/[id]` | GET,POST / PATCH | Supply inventory |
| `/api/housekeeping/bills` + `/[id]` + `/photo` | GET,POST / PATCH,DELETE / POST | Monthly bills |
| `/api/housekeeping/meters` | GET | Reading list + missed-target check |
| `/api/housekeeping/meters/analyze` | POST | Gemini vision read |
| `/api/housekeeping/meters/monthly` | GET | Monthly consumption totals |
| `/api/dashboard/housekeeping-ops` | GET | Cleaning speed/delay metrics |
| `/api/housekeeping/laundry/orders` + `/[id]` + `/status` + `/cancel` + `/payments` | GET,POST / GET,PATCH / POST / POST / POST | Laundry ticket lifecycle |
| `/api/housekeeping/laundry/services` + `/[id]` | GET,POST / PATCH | Service catalog |
| `/api/housekeeping/laundry/dashboard`, `/reports`, `/export/[format]` | GET / GET / GET | Laundry reporting |

### Access / TTLock
| Route | Methods | Purpose |
|---|---|---|
| `/api/access/credential/reveal` | POST | Staff on-demand credential reveal |
| `/api/access/credential/revoke` | POST | Revoke with required reason |
| `/api/access/credential/action` | POST | Log copy/send action |
| `/api/access/credential/housekeeping` | POST | Generate housekeeping code |
| `/api/access/credential/my-housekeeping-code` | GET | Self-lookup |
| `/api/access/emergency` | POST | Standalone emergency code |
| `/api/access/history` | GET | Audit trail |
| `/api/access/security-events` + `/sync` + `/[id]/dismiss` | GET / POST / POST | Security Monitor |
| `/api/access-management/members` + `/[id]` | GET / PATCH | Page/action grant management |
| `/api/ttlock/locks` | GET | Live lock list |
| `/api/ttlock/link` | POST | Link/unlink lock |
| `/api/ttlock/refresh` | POST | On-demand resync |
| `/api/ttlock/reserve-codes/provision` + `/status` | POST / GET | Reserve pool |
| `/api/webhooks/ttlock/[secret]` | POST | Real-time battery push |
| `/api/units/[id]/battery-replaced` | POST | Mark battery replaced |

### Units / Employees / Users / Payroll / Expenses / Coupons / Auditor
| Route | Methods | Purpose |
|---|---|---|
| `/api/units` + `/[id]` + `/photo` | GET,POST / PATCH,DELETE / POST | Unit CRUD |
| `/api/employees` + `/[id]` | GET,POST / PATCH,DELETE | Staff directory |
| `/api/employee-achievements` + `/[id]` | GET,POST / PATCH,DELETE | Achievement badges |
| `/api/users` + `/[id]` | GET,POST / PATCH,DELETE | Login accounts |
| `/api/my-earnings` | GET | Personal/admin payroll view |
| `/api/earnings/overview` | GET | Owner View payroll |
| `/api/leaderboard` | GET | Company leaderboard |
| `/api/weekly-expenses` + `/[id]` | GET,POST / PATCH,DELETE | Ad-hoc expenses |
| `/api/expense-requests` + `/[id]` + `/photo` | GET,POST / PATCH,DELETE / POST | Expense requests |
| `/api/coupons` + `/[id]` | GET,POST / PATCH,DELETE | Discount coupons |
| `/api/auditor-findings` + `/[id]` + `/open-count` + `/photo` | GET,POST / PATCH / GET / POST | Quality inspections |
| `/api/audit` | GET | Full audit-log trail |

### Guest Portal
| Route | Methods | Purpose |
|---|---|---|
| `/api/guest/booking-quote` | GET | Public availability + price |
| `/api/guest/coupon-check` | GET | Public coupon validity |
| `/api/guest/bookings` | POST | Self-service creation |
| `/api/guest/bookings/[id]/cancel` + `/request` + `/payment-proof` | POST / POST / POST | Guest self-service actions |
| `/api/guest/profile` | PATCH | Edit own profile |
| `/api/guest/door-code`, `/wifi` | POST / POST | Secure reveals |
| `/api/guest/feedback` + `/[bookingId]` | POST / GET | Post-stay survey |
| `/api/guest/notifications` + `/read` + `/unread-count` | GET / POST / GET | Guest inbox |
| `/api/guest/assistant` + `/escalate` | POST / POST | AI concierge |

### Analytics / Social / Settings / Places / Misc
| Route | Methods | Purpose |
|---|---|---|
| `/api/analytics/insight`, `/export/[format]` | POST / GET | AI narrative + export |
| `/api/dashboard/insight` | POST | Dashboard AI insight |
| `/api/attention/dismiss` | POST | Dismiss attention card |
| `/api/social/caption`, `/faq-rephrase`, `/export/[format]` | POST / POST / GET | Social Media Center |
| `/api/feedback` + `/[id]` | GET / PATCH,DELETE | Feedback moderation |
| `/api/reviews` | GET | Public review marquee |
| `/api/staff-notifications` | GET,PATCH | Staff inbox (see §35 — no UI consumer) |
| `/api/settings` + `/logo` + `/host-photo` + `/payment-qr` | GET,PATCH / POST / POST / POST | Site settings |
| `/api/owner-profile` + `/logo` | GET,PATCH / POST | Tenant identity |
| `/api/public/owner-brand` | GET | Public branding lookup |
| `/api/profile` + `/avatar` | GET,PATCH / POST | Own user profile |
| `/api/places/refresh`, `/photo` | POST / GET | Google Places guidebook enrichment |
| `/api/images/track-download` | POST | Unsplash compliance ping |
| `/api/messenger/webhook` | GET,POST | Facebook Messenger webhook |

---

## 31. Page / Route Inventory

41 pages confirmed via `find src/app -name page.tsx`.

| Route | Purpose | Audience |
|---|---|---|
| `/` | Redirects staff to their landing page, or renders the public guest guidebook hub | Mixed |
| `/login` | Staff sign-in | Staff |
| `/change-password` | Forced password change | Staff |
| `/dashboard` + `/dashboard/consolidated` | Financial/ops dashboard, cross-property view | Staff |
| `/bookings` | Booking management | Staff |
| `/calendar` + `/calendar/[unitId]` | Booking timeline, per-unit detail | Staff |
| `/housekeeping` | Cleaning board | Staff |
| `/admin` + `/admin/view-as-guest/[bookingId]` | Admin console, guest-preview QA tool | Staff |
| `/analytics` | Executive KPIs | Staff |
| `/auditor` | Findings tracker | Staff |
| `/earnings` | Personal/team payroll | Staff |
| `/social` | Social Media Center | Staff |
| `/platform` | Cross-tenant owner management | Platform admin |
| `/profile` | Own profile editor | Staff |
| `/notifications` | Guest notification inbox | Guest |
| `/maintenance` | Maintenance-mode holding page | Public |
| `/offline` | PWA offline fallback | Public |
| `/guest-login` | Guest sign-in | Public |
| `/account` | Guest's own account | Guest |
| `/book` + `/o/[ownerSlug]/book` | Public booking flow (default owner / per-owner-slug) | Public |
| `/listing/[id]` | Public listing detail | Public |
| `/my-bookings` + `/my-bookings/[id]` | Guest's bookings, detail + guidebook hub | Guest |
| `/guide/welcome`, `/check-in`, `/check-out`, `/wifi`, `/amenities`, `/house-manual`, `/location`, `/nearby/[category]`, `/contact`, `/emergency`, `/faqs`, `/reviews`, `/gallery`, `/feedback/[bookingId]` | Digital guidebook content pages | Guest |

Auth-check pattern: every staff page uses `getCurrentUser()` + `redirect("/login")` plus a specific `canSeeX()` check or `effectivePageAccess()`; every guest page uses `getCurrentGuest()` — some `/guide/*` pages render generic content with no guest gate at all, gating only their *secure* sub-widgets (door code/WiFi cards) on an active booking.

---

## 32. Critical Business Rules

Rules with real production-incident history behind them, each with its enforcement location:

1. **Money fields are whole pesos, coerced not rejected.** `bookingSchema.amount`/`dpAmount` use `moneyInt = z.number().nonnegative().transform(Math.round)` — `src/lib/validation.ts`. A typed decimal rounds instead of producing a raw Zod error to the user (confirmed live incident).
2. **A cancelled booking must never occupy the calendar or block a real Airbnb import.** Enforced independently at 3 sites: cancel route explicitly deletes the `CalendarBlock`; iCal import filters `cancelledAt: null`; the export feed filters `cancelledAt: null`. All three were separately-confirmed historical bugs.
3. **Double-booking is real-timestamp overlap, never same-day/different-type heuristics.** `bookingsConflict()` via `getOccupiedWindow()`, `src/lib/stayRange.ts` — this exact heuristic shortcut was a confirmed historical bug (property's own Daycation/Night defaults genuinely overlap 14:00–20:00).
4. **Commission is never trusted from client input, always `isCommissionEligible()`, never re-derived per-screen.** A refund always zeroes it; a staff-initiated "Remove" cancellation never earns it regardless of payment; only a genuine guest cancellation with money kept earns it.
5. **A cleaning action must be scope-checked and cannot target a cancelled booking.** `isUnitInScope` + explicit `cancelledAt` rejection in `PATCH /api/housekeeping/unit/[id]` — both were confirmed missing at different points in this app's history.
6. **`cleanedBookingIds` must be read inside the same transaction that appends to it**, not before — a confirmed, reproduced-live race between two same-day checkouts on one unit.
7. **A booking's financial fields (`amount`, `dpAmount`, `paid`, etc.) require `bookings.financial` action access, stripped server-side otherwise** — a confirmed-live gap where Housekeeping could set an arbitrary paid amount via direct API call.
8. **TTLock code generation must never block a booking or leave a cleaner locked out** — every credential path (guest, emergency, housekeeping) falls back to the reserve-code pool after 3 retries; only the emergency and housekeeping paths originally lacked this and were fixed after real documented outages.
9. **A unit's reserve-code pool must exist before it's needed** — `neverProvisionedUnits` is now a first-class Dashboard alert, after a real incident where a unit's emergency button had nothing to fall back to.
10. **Occupancy never double-counts a shared unit-day across two stay types** — deduplicated by `(unitId, calendarDay)` pair in `computeOccupancy()`, a confirmed historical over-counting bug.
11. **Analytics revenue/ADR/RevPAR/growth always account for refunds** — a confirmed historical bug where 4 of 5 revenue-feeding queries omitted `refundedAt`, silently overstating multiple KPIs simultaneously.
12. **A guest identity is never collapsed on a shared placeholder value.** `"Not provided"` in legacy `contactNumber` data must never be treated as a real identity key — a confirmed historical bug merged 258 real bookings into one fabricated guest profile.
13. **The Meter Reading AI must prefer uncertainty over a guess** — the prompt's explicit human-review trigger list (confidence thresholds on the overall reading, any single digit, register localization, and image quality) determines `AUTO_ACCEPT` vs `MANUAL_REVIEW_REQUIRED`; the reading is always saved either way — never silently discarded, never silently auto-corrected.
14. **The meter-target "missed" alarm checks yesterday, never today** — there is no defensible same-day "too late" cutoff, so the persisted alarm only ever asserts a fact about a fully-completed day.

---

## 34. Historical Bugs / Fixes

26 distinct, independently-verified historical defects, compiled from 288 commits of git history and this codebase's strong convention of leaving an inline comment explaining *why* a fix exists.

| # | Issue | Root Cause | Fix | Regression Risk |
|---|---|---|---|---|
| 1 | Double-booking race under concurrency (10/10 duplicates in a live test) | Availability check and `create()` were two unguarded round trips | Single `$transaction`; cancel/refund/delete use atomic conditional `updateMany` | Low — structurally prevented now |
| 2 | Airbnb import racing a concurrent manual booking | Stale overlap snapshot at loop start | Live re-check (`overlapsManualTx`) inside the same write transaction | Low |
| 3 | Booking write and CalendarBlock mirror non-atomic | Two separate writes, no transaction | Wrapped in one `$transaction` per event | Low |
| 4 | Duplicate recurring bills under concurrent page loads | `createMany({skipDuplicates})` unsupported on libSQL | Real `@@unique([templateId, month])` + per-row insert | Low |
| 5 | Housekeeping finish-clean non-atomicity | State/log/payroll-credit as 3 separate writes | Single `$transaction` | Low |
| 6 | `cleanedBookingIds` race, reproduced live with 2 real bookings | Array read before the transaction that appends to it | Read moved inside the transaction | Low |
| 7 | Recurring-expense creation silently dropping bills | `Promise.all` could return before stragglers landed in serverless | Sequential loop (no real concurrency loss — DB is mutex-serialized anyway) | Low |
| 8 | Duplicate `payment.received` notification | Stale `paid` snapshot read before the transaction | Fresh read inside the same transaction | Low |
| 9 | Duplicate housekeeping/calendar entries on repeated Mark Clean clicks | No unique key on checkout | Real unique constraint + atomic upsert | Low |
| 10 | `Booking.cleanerId` never synced from Housekeeping tab (8/10 real checkouts affected) | Two independent write paths, one incomplete | Backfilled on finish, only if unset | Low |
| 11 | "Mark clean" 500s whenever photos attached (real stuck cleaning task) | A Prisma JSON-field extension patched `.create()` but not `.upsert()` | Extension fixed; client now checks `response.ok` | Medium — same extension pattern could recur elsewhere if unaudited |
| 12 | Zero-length occupied-range defeats the duplicate guard | Bad `checkOutDate` collapsed the range to zero, and strict `<` treats zero-length as never-overlapping | Falls back to `date+1` when `checkOutDate` isn't genuinely after check-in | Low |
| 13 | Same-day Flexible conflict check misses midnight wraparound | Naive minute comparison, no wraparound | Routed through the real timestamp engine | Low |
| 14 | Stay-type-based conflict shortcut (not real timestamps) | Assumed non-overlapping default windows — false for this property's own rates | Real timestamp overlap check; 37 pre-existing conflicting pairs flagged for manual review | Medium — flagged pairs may still exist unresolved in production data |
| 15 | Cancelled bookings still blocking availability (3 independent sites) | Missing `cancelledAt: null` filter in 3 separate queries | Added at all 3: chat widget, iCal import, iCal export | Low |
| 16 | Occupancy double-counted a shared unit-day | Day-granularity view, not deduplicated by (unit,day) | Deduplicated via `Map<unitId,Set<day>>` | Low |
| 17 | Analytics silently ignoring refunds in 4 of 5 revenue queries | Incomplete rollout of a `refundedAt` filter across near-duplicate selects | Consolidated onto the shared `collectedRevenueCentavos` helper | Medium — any new ad-hoc revenue query must remember to use the shared helper |
| 18 | Backwards custom date range zeroed every Analytics KPI | No min/max guard; existing nudge-forward fix made an inverted range *more* inverted | Swap start/end when inverted | Low |
| 19 | Refunded-but-not-cancelled bookings still counted in ADR/Team/per-unit earnings | 3 separate call sites reimplementing revenue logic instead of the shared helper | Switched to `collectedAmountPesos` everywhere | Low |
| 20 | Apples-to-oranges KPI period comparison + Manila-timezone "now" bug | Full-month current vs. elapsed-clipped previous; UTC `now()` compared against Manila-placeholder boundaries | Added `mtd*` elapsed-clipped variants + `manilaNowPlaceholder()` | Low |
| 21 | Revenue-goal leaderboard sorted on an already-rounded percentage | Two units a few hundred pesos apart rounded to the same displayed % | Sort on the real unrounded ratio, raw revenue as tiebreaker | Low |
| 22 | 258 bookings collapsed into one fake guest identity | Legacy `"Not provided"` placeholder treated as a real identity key | Shared `identityKey()` helper prioritizing guestId → real phone → name | Low |
| 23 | Booking amount decimals hard-rejected with a raw Zod error | Bare `z.number().int()` | `moneyInt` transform rounds instead of rejecting, client + server | Low |
| 24 | Tenant-isolation/cross-owner gaps (multiple sweeps, several commits) | `unitWhere`/`unitIdWhere` scoped reads but not all writes; several models unscoped entirely; impersonation leaked cross-tenant existence via 403 vs 404 | `isUnitInScope()` guard added everywhere; uniform 404; Next.js upgraded for an unrelated CVE (middleware auth bypass) found during the same sweep | Medium — this class of gap has recurred across multiple sweeps; new write routes should be checked against this pattern |
| 25 | TTLock resilience gaps (guest path had no fallback; emergency path had none until a real outage; status tracking missed some paths) | No reserve-pool fallback on 2 of 3 credential types; `TtlockStatus` only recorded outcomes from one path | Fallback added to all 3 credential types; every real TTLock call now reports into the shared status signal | Low |
| 26 | Raw-SQL DateTime boundary silently drops a row (project convention risk, not a single commit) | libSQL compares DateTime as TEXT lexicographically; a differently-formatted-but-valid ISO string breaks a `lte` filter | Documented as an established risk for this project's raw-SQL scratch-script workflow | Ongoing — a process risk, not a code fix |

---

## 35. Known Issues

Discovered defects/gaps, not fixed as part of this discovery pass (per the task's explicit instruction not to modify anything found here):

1. **No confirmed UI trigger for `checkedOutAt`.** Server-side support and a real downstream side effect (access-code release) exist; no client call site sending `{checkedOutAt: ...}` was found anywhere. Before writing regression tests against an explicit "mark checked out" staff action, confirm whether this UI genuinely doesn't exist (checkout is inferred purely from date/time passing) or was simply not located in this pass.
2. **`StaffNotification` has a fully working backend with zero UI consumers.** `GET/PATCH /api/staff-notifications` works and is fed real writes from 9 real event types — no bell icon, badge, or inbox screen anywhere renders it.
3. **Three notification event types are defined but never triggered**: `checkin.reminder`, `checkout.reminder` (guest-facing), `code.expiring` (staff-facing). Dead code, not a silent failure — each has message text and a type definition but zero callers.
4. **`Booking.conflict` is not visually surfaced on the Calendar grid** despite being a real field set by the iCal importer — visible only as a list-view tag on the Bookings page.
5. **No Parking or Management Fee model/field/calculation found anywhere** in the schema or pricing engine, despite being named in the original task brief's checklist. Classified Referenced But Not Found — either genuinely unimplemented or handled entirely outside this codebase (e.g., a manual line item folded into `amount`).
6. **No team-level (as opposed to individual) reward/payout formula found** for the Team A/B/C gamification grouping — team performance is displayed, not separately rewarded, as far as could be confirmed.
7. **The coupon atomic-usage-claim's race-safety was not independently re-verified in this pass** — confirmed to exist inside `createBookingCore()`'s transaction per code comments, but the exact `updateMany` guard clause wasn't re-read line-by-line.
8. **37 pre-existing booking pairs were flagged (not resolved) as real conflicts** when the double-booking conflict detector was corrected (historical bug #14) — these may still be unresolved in production data.
9. **This document's dual-hosting claim (Vercel + Railway from one codebase against one database) is carried forward from this engagement's own prior session work, not independently re-verified in this discovery pass** — flagged so it isn't mistaken for freshly-confirmed fact.

---

## 36. QA Testability Matrix

| Feature | Manual | Automated | External Dependency | Test Data Required | Difficulty |
|---|---|---|---|---|---|
| Booking create/edit/cancel/refund | Yes | Partial (no route tests found) | None | Real unit, employee, owner | Low |
| Double-booking conflict detection | Yes | Yes — pure functions in `stayRange.ts` are unit-testable | None | Two overlapping booking payloads | Low |
| Pricing/quote engine | Yes | Yes — pure function `quotePrice()` | None | A `Settings` row with rates | Low |
| Housekeeping state machine | Yes | Partial | None | A real booking + unit | Medium (transaction-race scenarios need concurrency tooling) |
| TTLock code generation | Yes (needs a real lock) | Difficult — real API, no mock found | Live TTLock account + physical/virtual lock | `TTLOCK_*` credentials, a linked lock | High |
| TTLock reserve-code fallback | Yes (simulate API failure) | Possible with a mocked client | None if mocked | A unit with a provisioned pool | Medium |
| Meter Reading AI pipeline | Yes | Difficult — real Gemini call, no mock found | `GEMINI_API_KEY`, live Gemini API | Real meter photos across quality tiers | High |
| Airbnb iCal sync | Yes | Difficult — depends on a live/simulated `.ics` feed | A reachable iCal URL | A unit with `icalImportUrl` set | Medium-High |
| Dashboard/Analytics formulas | Yes | Yes — `finance.ts`/`payroll.ts`/`analytics/*` are pure and importable | None | Seeded bookings/bills/expenses across a known period | Low-Medium |
| Gamification/Elite Booker Challenge | Yes | Partial | None | Multiple bookers with staged completed-booking counts | Medium |
| Guest Portal auth (magic link) | Yes | Difficult — requires reading a real sent email | `RESEND_API_KEY`, an inbox | A guest email | Medium |
| Guest Portal auth (confirmation number) | Yes | Yes — no email dependency | None | A real confirmation number | Low |
| Offline queue (Housekeeping photo/status, check-in) | Yes (requires DevTools offline mode or airplane mode) | Difficult — needs a real browser + IndexedDB | None | A device/browser session | Medium-High |
| Multi-staycation switcher / impersonation | Yes | Partial | None | A user with an `OwnerAccess` grant to 2+ owners; an OWNER_ADMIN account | Medium |
| RBAC/action-access boundaries | Yes | Yes — pure functions in `rbac.ts`/`actionAccess.ts` | None | One user per role | Low |

**Existing automated test coverage**: exactly 2 files — `src/lib/stayRange.test.ts`, `src/lib/access/eventClassifier.test.ts` (Vitest 4.1.10, `vitest.config.mts`). No API-route-level or component-level tests were found anywhere in the repository.

---

## 37. Environment Requirements

- **Node.js**: no version pinned in `package.json` (`engines` field absent) and no `.nvmrc` present in the repo.
- **Package manager**: npm (lockfile is `package-lock.json`-style per `postinstall` script convention; not independently confirmed by reading the lockfile itself in this pass).
- **Database**: Turso (libSQL), accessed via `@prisma/adapter-libsql`.
- **Commands** (from `package.json`): `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`next lint`), `test` (`vitest run`), `db:generate`/`db:migrate`/`db:push`/`db:seed`/`db:studio`.

**Environment variables** (names only — no values captured or should ever be captured):

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Turso connection |
| `TURSO_AUTH_TOKEN` | Turso auth |
| `NEXTAUTH_SECRET` | Staff JWT signing |
| `GUEST_SESSION_SECRET` | Guest JWT signing (distinct from staff) |
| `CRON_SECRET` | Daily cron auth |
| `GEMINI_API_KEY` | AI (meter reading, concierge, insights, captions) |
| `GEMINI_MODEL` | Optional model override |
| `GOOGLE_PLACES_API_KEY` | Guidebook "Nearby" enrichment |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client-side Maps JS |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Guest magic-link email |
| `TTLOCK_CLIENT_ID` / `TTLOCK_CLIENT_SECRET` / `TTLOCK_USERNAME` / `TTLOCK_PASSWORD` | TTLock OAuth |
| `TTLOCK_CALLBACK_SECRET` | Webhook path-segment auth |
| `MESSENGER_APP_SECRET` / `MESSENGER_VERIFY_TOKEN` | Facebook Messenger webhook |
| `NODE_ENV` | Standard Next.js |

Vercel Blob token is provisioned automatically by the Vercel platform integration (`@vercel/blob`), not a manually-set app secret in the same category as the above.

---

## 38. Actual vs Expected Functionality

### Confirmed Implemented
Booking CRUD + lifecycle derivation; real-timestamp conflict detection; pricing engine with weekday/weekend/promo/Flexible-fee rules; Calendar mirror sync; Housekeeping state machine with transaction-safe transitions; TTLock integration with retry/fallback chain; Meter Reading full AI pipeline with human-review gating; the shared finance/payroll calculation libraries and every formula documented in §15; the Elite Booker Challenge tiered/slotted reward system; Guest Portal (both login methods, guidebook, requests, feedback); Airbnb iCal two-way sync with race-safe writes; role-based access control at 3 layers (role defaults, granular action grants, page-level grants intersected with tenant module tier); multi-staycation switching and impersonation with independent server-side re-validation; the offline mutation queue for its 3 confirmed call sites; the missed-meter-reading alarm system.

### Partially Implemented
Checkout (`checkedOutAt` — real data model and side effects, no confirmed UI trigger); Team-level gamification (displayed, not separately rewarded); coupon atomic-claim (exists per code comments, not independently re-verified in this pass); Guest journey status vs. staff lifecycle status (two independent derivations that can disagree at the margins by design, not a bug, but worth flagging as "two sources of truth" for anyone building a report against booking status).

### Referenced But Not Found
Parking (any form — motorcycle/car, revenue or fee); a dedicated "management fee" pricing component; a push-notification delivery mechanism (service worker stubs exist, nothing wired to them); a real unlock-history table populated from the TTLock webhook (webhook only updates battery telemetry today).

### Unknown
Whether the coupon `usedCount` atomic claim is genuinely race-safe under real concurrent redemption (not re-read line-by-line in this pass); whether 37 previously-flagged conflicting booking pairs remain unresolved in current production data; exact behavior of `manilaDayKey`/`manilaNowPlaceholder` at DST/period-boundary edge cases (not fully audited); whether the dual Vercel+Railway hosting claim still holds (carried forward from prior session work, not re-verified here).

### Broken
Nothing was found to be actively broken/erroring in normal operation during this discovery pass — every gap identified above is a **missing** capability (dead code, no UI consumer, unimplemented feature), not a confirmed runtime failure. This distinction matters: "Known Issues" here are gaps, not live defects.

---

## 39. QA Preparation Requirements

To execute a regression pass against this specification, prepare:

- **Accounts**: one active user per role (`OWNER_ADMIN`, `CO_OWNER`, `HOUSEKEEPING`, `BOOKER`, `AUDITOR`) on at least one owner; a second `OwnerAccess`-granted user spanning two owners (for switcher/impersonation testing); a Platform Admin account (`isPlatformAdmin: true`).
- **Data**: at least 2 units on the primary owner, one unit on a second owner (tenant-isolation testing); a `Settings` row with real, non-default rates; a handful of bookings across every `stayType`/`platform` combination, including at least one Airbnb-`source` and one cancelled/refunded booking; a unit with a linked TTLock lock and a provisioned reserve-code pool; a unit with **no** reserve pool (to exercise the `neverProvisionedUnits` alert); a guest account with at least one bookable/valid confirmation number and one expired-window booking (to test the stay-scoped login boundary).
- **Credentials/external services**: a real (or sandboxed) TTLock account for lock-integration testing; a `GEMINI_API_KEY` for meter-reading and AI-insight testing; a reachable test `.ics` URL for Airbnb sync testing; a Resend account/inbox for magic-link email verification.
- **Browser permissions**: camera access (meter reading, housekeeping photos both use `capture="environment"`), notification permission if push is ever wired up (currently stubbed, low priority), offline/airplane-mode simulation capability (DevTools Network tab or a real device).
- **Concurrency tooling**: several historical bugs (§34, items 1, 2, 6, 8, 12, 13) were specifically found via reproduced concurrent-request scenarios — a load-testing or scripted-concurrent-request tool is warranted for regression coverage of these specific fixed races, not just single-request manual testing.

---

## 40. Functional Dependency Map

```
Booking
 ├── Calendar (CalendarBlock mirror, kept in sync on every create/edit/cancel/delete)
 ├── Finance (feeds revenue/ADR/RevPAR/occupancy/commission via the shared finance.ts/payroll.ts)
 ├── Housekeeping (checkout date drives the "needs cleaning" schedule)
 ├── Guest (GuestNotification on create/update/cancel/payment; guest self-service creation)
 ├── TTLock (access-code issuance at creation, release on checkout/cancel/delete)
 ├── Notifications (StaffNotification for booker-adjacent events; GuestNotification for guest-adjacent)
 ├── Gamification (completed/eligible bookings feed the Elite Booker Challenge + achievements)
 └── Airbnb/iCal (bidirectional: staff bookings export to Airbnb; Airbnb reservations import as bookings)

Checkout (inferred date/time boundary — see §35 issue 1 for the UI-trigger gap)
 ├── Booking status (lifecycleStatus flips to "completed")
 ├── Housekeeping ("needs cleaning" signal activates for the unit)
 ├── TTLock (access code released — confirmed code path, unconfirmed UI trigger)
 ├── Unit availability (no automatic effect beyond the cleaning-status derivation)
 └── Finance (no automatic settlement — any unpaid balance simply remains unpaid)

Housekeeping "Finish Cleaning"
 ├── HousekeepingUnitState (status → clean, cleanedBookingIds appended)
 ├── CleaningLog (created/updated, keyed uniquely on bookingId)
 ├── Booking.cleanerId (backfilled if unset — feeds Night Clean Bonus payroll)
 ├── Calendar (Cleaning-type CalendarBlock closed)
 ├── AccessCredential (housekeeping code released)
 └── StaffNotification (cleaning.completed)

Meter Reading capture
 ├── Vercel Blob (photo storage)
 ├── Gemini AI (analysis)
 ├── MeterReading (persisted regardless of accept/review outcome)
 ├── Dashboard/Housekeeping metrics panel (monthly aggregation)
 └── StaffNotification (missed-target alarm, checked the day after a target day)

Multi-staycation switch / Impersonation
 ├── auth.ts jwt() callback (sole real enforcement point for both)
 ├── unitWhere/unitIdWhere/isUnitInScope (every scoped query re-derives from the active token)
 └── Employee provisioning (ensureEmployeeForUser/ensureEmployeeForOwnerAccess keep a resolvable staff identity on every owner a user can reach)
```

---

## 41. Final System Capability Summary

| Metric | Count |
|---|---|
| Major functional areas discovered | 26 (property/unit, booking, calendar, guest, check-in, checkout, housekeeping, TTLock, meter reading, finance, expenses, dashboard, staff/RBAC, booker, gamification, guest experience, booking sources, Airbnb/iCal, notifications, offline/PWA, mobile, auth, authorization, laundry sub-module, coupons, audit/security) |
| API routes | 145 |
| Page routes | 41 |
| Major database models | 50 |
| External integrations | 6 (Turso/libSQL, TTLock, Google Gemini, Vercel Blob, Resend, Google Places/Maps) + Facebook Messenger webhook + Airbnb iCal (data feed, not a formal API integration) |
| User roles | 5 (OWNER_ADMIN, CO_OWNER, HOUSEKEEPING, BOOKER, AUDITOR) + 1 orthogonal flag (Platform Admin) |
| Critical business workflows documented | 14 (§32) |
| Known historical defects (fixed, cited) | 26 (§34) |
| Confirmed currently-open gaps | 9 (§35) |
| Automated test files | 2 |
| Git history depth | 288 commits |

**Document status**: this specification reflects a direct-inspection pass of the current repository state. It was cross-validated by a second review pass checking for missed routes/APIs/models/roles/integrations/workflows, confirming distinguishing implemented-vs-planned functionality, and confirming no secrets are exposed anywhere in this document (only environment variable *names* appear, never values). No functionality was invented; every "Confirmed Implemented" claim traces to a specific file, and every gap is labeled with its actual confidence level rather than presented as settled fact.

**Next step** (per the originating task, explicitly not started in this pass): use this specification as the basis for a complete regression test plan covering every documented function, prioritized using the QA Testability Matrix (§36) and the 9 confirmed open gaps (§35) as the highest-value starting points.
