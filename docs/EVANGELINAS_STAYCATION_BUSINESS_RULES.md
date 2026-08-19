# Evangelina's Staycation — Business Rules

Every rule below is verified against the actual running code and/or live production data as of this audit — not assumed from a prior brief or documentation. Where a widely-assumed rule turned out not to match reality, that's stated explicitly rather than silently corrected or silently accepted.

---

## Pricing (`src/lib/pricing/rates.ts`, `Settings` model — Admin-editable, not hardcoded)

Current live defaults: weekday ≤12h **₱1,499**, weekday >12h–21h **₱1,699**, weekend ≤12h **₱1,699**, weekend >12h–21h **₱1,899**, weekday-night promo **10%**, Flexible-stay fee **₱150** (flat, once per booking, not per hour), down-payment **₱500**.

- **Daycation/Night** price against the "12h" tier; **Full** prices against the "21h" tier.
- Weekend vs. weekday is decided **per night** (Fri/Sat/Sun = weekend in Asia/Manila), so a stay crossing the boundary charges each night at its own rate.
- The **10% promo** applies only to `Night`-stay nights (or a `Flexible` stay whose check-in is ≥17:00, treated as "night-like") landing Monday–Thursday. Daycation and Full are never discounted.
- No per-unit rate variation. No "extension" rate at all — a staff member extending a stay types a free-form peso amount into "Extend stay / add charge," not a fixed ₱/hour formula.
- **Parking (Car ₱400 / Motorbike ₱250) and a Management Fee (₱500/booking) do not exist anywhere in the pricing engine, the Booking model, or the Settings model.** Verified directly against the schema and `rates.ts`. If these are genuinely wanted, they need to be built as new functionality — they are not currently implemented under a different name.

## Commission

**Flat ₱100/booking** (`Settings.bookerCommission`, admin-configurable) — **not percentage-based**. Applies to whoever is `bookerId` on a commission-eligible booking (paid, or a genuine guest cancellation with money kept; never a refunded or staff-initiated-cancelled booking), regardless of that person's primary role.

## Payroll (`src/lib/payroll.ts`, `Employee.salaryRate`/`salaryType`/`SalaryHistory`)

**The database is the canonical source, not a hardcoded rule.** `monthlySalaryFromRate`: `DAILY → round(rate×365/12)`, `WEEKLY → round(rate×52/12)`, `MONTHLY → unchanged`. `effectiveMonthlySalary()` reads the most recent `SalaryHistory` entry at-or-before the query date, so editing today's rate never rewrites past reports.

**Verified real current figures** (queried live, not assumed):

| Person | Role | Rate | Team |
|---|---|---|---|
| Riemar Ligad | Booker | ₱1,000/week | A |
| Louis Phillip Falaminiano | Booker | (rate not set) | A |
| Earl Domingo | Booker | (rate not set) | A |
| Christian Baluyot | Booker | (rate not set) | B |
| Manex Apagalang | Booker | (rate not set) | B |
| Justine Oliva | Housekeeping | ₱4,900/week | C |
| Mark Anthony Licud | Booker | (rate not set) | C |
| Mharies Arceo | Booker | (rate not set) | **no team assigned** |
| Christian Elesterio | Housekeeping | **₱15,000/month** | (no team) |

**Correction to a widely-assumed rule**: an earlier brief described Group A as {Riemar, Mark, Louis}, Group B as {Justine, Mharies}, Group C as {Christian Baluyot, Augustine Ferrer, Manex Apagalang}, and "Christian: ₱15,000/month." None of the team rosters match live data, and "Christian: ₱15,000/month" refers to **Christian Elesterio** (Housekeeping), not **Christian Baluyot** (Booker, real Team B) — two different people. "Augustine Ferrer" is not a currently-active employee. The real rosters are the table above. Team assignment lives entirely in `Employee.teamKey`, edited per-person, not a fixed rule anywhere in code.

**Justine's fixed-salary-covers-cleaning carve-out** (`Employee.fixedSalaryCoversCleaning = true`): her weekly salary already covers day-to-day cleaning, so My Earnings shows only her qualifying Night Clean Bonus activity, never a separate "regular pay" line.

**Night Clean Bonus** (current portfolio-wide rule, `computeTeamBreakdown`): a cleaning qualifies if its booking's check-in time is ≥17:00 **and** that day's total cleanings across the whole property exceed the total unit count (i.e., at least one unit turned over more than once that day). Default **₱300/qualifying clean**, pool capped so it can't exceed the real number of "extra" cleanings that day. **Known inconsistency** (see Known Issues): the "Lifetime earnings" figure on My Earnings still uses an older, different rule (same-unit/day ≥2 cleanings) — not yet unified with the current rule, deliberately deferred pending human review of real payroll figures.

## Gamification — Elite Booker Challenge (`src/lib/gamification.ts`)

Company-wide (per-tenant), monthly, limited winner slots per tier:

| Completed bookings | Reward | Slots | Badge |
|---|---|---|---|
| 50 | ₱500 | 2 | 🥉 Bronze Booker |
| 100 | ₱1,500 | 2 | 🥈 Silver Booker |
| 150 | ₱2,500 | 2 | 🥇 Gold Booker |
| 200 | ₱3,500 | 1 | 💎 Platinum Booker |
| 250 | ₱5,000 | 1 | 👑 Legend Booker |

Eligible roles: Booker, Housekeeping. First N employees to cross each threshold (ranked by real completion timestamp) win; awards are permanent once recorded, never reassigned by a later recompute. **No explicit monthly reset job exists** — the "reset" is implicit: the month key in the award's composite identity changes, so a new month simply accumulates fresh.

## Expenses — cash-based accounting

An expense affects Net Profit/Margin/Cash Flow **only once actually paid**. A `Bill` marked "Scheduled"/"Due"/"Overdue" (all pure UI derivations of an unpaid, due-dated record) never reduces any financial metric — only `paid: true` does. `ExpenseRequest` has a real pending/realized split: only `APPROVED` counts toward realized costs; `PENDING` feeds Forecast only. Payroll itself has no paid/unpaid flag at all — it's always accrued day-by-day through the period, a deliberately different model from Bill's binary gate.

## Booking date/time domain — the rule this audit exists to enforce

`getOccupiedWindow()` (`src/lib/stayRange.ts`) is the single source of truth for a booking's real occupied window. Its `start`/`end` are **Asia/Manila wall-clock placeholders** (an hour-of-day stamped onto a UTC-labeled calendar day) — **never real UTC instants**. Two, and only two, correct ways to consume them:

1. **Real-instant comparison** (is it before/after `now`, how many minutes elapsed): convert via `manilaWallClockToRealInstant()` first.
2. **Calendar-day extraction** (what day does this fall on): convert via `nominalCalendarDay()`/`checkoutDisplayDay()` (bare UTC truncation) first — **never** chain this after a real-instant conversion, and never run the raw placeholder through a genuine timezone-aware formatter (`Intl.DateTimeFormat` with `timeZone: "Asia/Manila"`, `manilaDayKey()`, `dayOf()`) directly.

Every real bug fixed in this audit's booking-status/tardiness work traced back to violating one of these two rules. This is now the canonical, documented convention for any future code touching `getOccupiedWindow()`'s output.
