# Admin Portal

> Part of the [Evangelina's Staycation documentation](README.md). Covers the staff-side application — the `/admin` page specifically, plus a map of the other role-gated staff pages. Guest-facing pages are [Guest-Experience.md](Guest-Experience.md)/[Guest-Portal.md](Guest-Portal.md).

- [Staff page map](#staff-page-map)
- [The `/admin` page](#the-admin-page)
- [Units tab](#units-tab)
- [Users & roles tab](#users--roles-tab)
- [Operations tab](#operations-tab)
- [Feedback tab](#feedback-tab)
- [Settings tab](#settings-tab)

## Staff page map

All gated by `src/middleware.ts` per the role table in [Business-Rules.md](Business-Rules.md#roles--permissions).

| Page | Purpose |
|---|---|
| `/dashboard` | Financial overview — revenue, occupancy, payroll summary, AI-written insight, "Needs your attention" cards |
| `/analytics` | Deeper reporting: bookings, revenue, occupancy, staff performance, forecast — exportable as CSV/XLSX/PDF |
| `/bookings` | Booking list/agenda view, create/edit/cancel/delete, Excel/CSV import |
| `/calendar` | Per-unit occupancy calendar, Airbnb sync history/manual sync |
| `/housekeeping` | Cleaning checklist execution, unit status, stock counts, bills |
| `/auditor` | Read-only ledger (bookings, bills), full audit trail, quality-inspection findings |
| `/earnings` | Staff's own pay/commission breakdown ("My Earnings") |
| `/admin` | Site configuration — see below. **OWNER_ADMIN only.** |

## The `/admin` page

`src/components/admin/AdminView.tsx` — 5 tabs: **Units**, **Users & roles**, **Operations**, **Feedback**, **Settings**. Every write action here is `requireUser(["OWNER_ADMIN"])`-gated server-side, independent of the tab UI only being reachable by that role.

## Units tab

Add/edit/delete the 5 rental units — name, unit number, nightly rate, photo, location, active flag, sort order, and the Guest Experience per-unit fields (WiFi SSID/password, door code, check-in/out instructions, video tutorial URL). Also assigns which units a `CO_OWNER` can see (`UnitOwner`). A unit with real booking/cleaning/bill history cannot be deleted (DB-level `Restrict` — see [Database.md](Database.md#models)).

## Users & roles tab

Add/edit/deactivate staff accounts — name, username, password, role, avatar color, `showOnGuestGuide` opt-in (whether they appear on the guidebook's "Meet our team" card), and (for `CO_OWNER`) which units they're scoped to.

## Operations tab

Two sub-views (Bills / Supplies), each editable per unit:
- **Bills** — the same `BillsPanel` used elsewhere, here without the "mark paid" toggle or the metrics header — pure record-keeping/editing surface.
- **Supplies** — per-unit stock counts. Adding a **new** stock item (not adjusting an existing count) is Admin-only, per [Business-Rules.md](Business-Rules.md#roles--permissions).

## Feedback tab

Read-only view of every guest feedback survey response (`FeedbackResponse`), plus aggregate analytics (rating distribution, liked tags, recommend rate).

## Settings tab

Five collapsible sections:

| Section | Contains |
|---|---|
| **Business & payroll rates** | Business name/address, the full accommodation rate table + weekday-night promo %, down-payment fee, payroll rates (housekeeping day rate/night bonus, booker commission, auditor weekly rate), extension/flexible/parking/celebration fees, and all Guest Experience content overrides (categories, amenities, house rules, FAQs, emergency contacts, staff contacts, host bio/photo, property lat/lng) |
| **Coupons** | Create/edit/deactivate discount codes |
| **Housekeeping checklist** | Edit the checklist groups/items every unit's cleaning checklist is built from |
| **Login logs** | Staff sign-in history (from `AuditLog`, `action = "user.login"`) |
| **Nearby places data** | Per-category "Refresh" buttons that trigger a real, billed Google Places API lookup for every named place in that category (see [Integrations.md](Integrations.md#google-places-api)) — deliberately manual, never scheduled |

All Settings writes go through `PATCH /api/settings`, validated against `settingsSchema` (`src/lib/validation.ts`) — every field that can be edited here must be explicitly listed in that schema, or Zod's default unknown-key-stripping will silently drop it (this was a real, previously-undiscovered bug found and fixed earlier in this project's history: several rate fields were addable in the UI but silently never persisted).
