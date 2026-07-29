# Changelog

> Part of the [Evangelina's Staycation documentation](README.md). This is a curated summary of notable changes, grounded in real `git log` history — **not** a complete commit-by-commit record (159 commits exist in the repository at the time of writing; this lists the significant, documentation-relevant ones). For the exact full history, run `git log` directly.

## Social Media Center redesign, booking-engine correctness, and a real-data audit pass

- **Booking engine**: fixed real-timestamp conflict detection (`bookingsConflict()` in `stayRange.ts`) to correctly flag two midnight-crossing Flexible bookings on the same unit/day as conflicting — the same-day-both-Flexible branch was still using the old midnight-unaware `timeWindowMinutes` check instead of the new real-timestamp window comparison. Found and fixed via live testing, not just code review.
- **Social Media Center** — see the new [Social-Media-Center.md](Social-Media-Center.md) for the full feature. Notable fixes along the way: a blended per-stay-type price bug (one `Math.min()`-across-everything "From ₱X" could silently surface a promo-discounted Night rate under a generic label), two Canvas rendering bugs (an unwrapped unit name running off the exported image, and emoji rendering as a broken OS glyph — both fixed, canvas text is never given emoji anywhere in this app now), the Available Dates tab silently listing already-elapsed dates, a small rail-tile card whose badge visually collided with the unit name on a compact layout, and an orphaned "our page" line appearing on its own when no real contact phone/messenger was configured (now omitted entirely rather than shown out of sentence context).
- **Brand Kit** — new Admin Settings panel (logo, brand colors, social handles) feeding the Social Media Center's exports. See [Admin-Portal.md](Admin-Portal.md#settings-tab).
- **Performance**: `/calendar`, `/housekeeping`, `/auditor`, `/social` were serializing their own multi-query loads behind the shared `prisma` client despite wrapping them in `Promise.all` (the libSQL adapter mutex-serializes one client's queries regardless); moved to the existing `prismaPool` pattern — confirmed 3–4x faster `/calendar` load in a real production build. `/bookings`' unbounded full-history fetch (both initial load and post-mutation refresh) was bounded to a 90-day default window with a "Show older bookings" escape hatch, load-tested at ~7x real volume. See [Performance.md](Performance.md#database--query-review).
- **Real-data audit**: found and fixed a genuine occupancy double-counting bug — a unit with both a Daycation and a Night/Full booking on the same real calendar day (legal; they occupy different time-of-day windows) was counted as 2 occupied nights against 1 available night, verified live to have inflated reported "This Month" occupancy from a true 76% to a wrong 81%. Also found and fixed the unit revenue-goal leaderboard (and "Top Performing Unit" badge) sorting on an already-rounded percentage, which could rank a lower-revenue unit above a higher-revenue one on a display-rounding tie. See [Business-Rules.md](Business-Rules.md#occupancy-adr-revpar).

## This documentation & hardening pass

- Added the full `/docs` documentation set (this file and its siblings).
- **Security**: added CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy headers (`next.config.mjs`); closed an open SSRF/DoS surface in the Next.js image optimizer (`images.remotePatterns` was wildcarded to any host); audited all 76 API routes for auth/IDOR (no unexpected gaps found; two low-severity gaps disclosed in [Security.md](Security.md#known-gaps)); closed a gap where the AI Concierge could state a guest's real WiFi password/door code directly in chat, bypassing the reveal gate.
- **Booking ID validity**: confirmation numbers now expire (stay dates + 24h grace, honoring extensions automatically) rather than working forever; added OWNER_ADMIN-only "reactivate" and "generate new code" actions; backfilled confirmation numbers onto pre-existing bookings that predated the feature.
- **WiFi/door-code reveal gate**: both now require re-entering the booking confirmation number even for an already-signed-in guest, closing a gap where the raw values were previously included in the page payload.
- Real guest testimonials + rating added to `/guide/reviews` (previously an honest empty state).
- Added Hospitals, Schools, Nightlife, and Concerts & Theater to the Guide hub's neighborhood categories, plus real walk/drive-time badges on the hub tiles themselves.
- Fixed the Guide hub tile grid wasting desktop screen space (a rigid extra-columns approach was leaving empty grid tracks since every section has exactly 4 tiles).
- Added a fade/wheel-scroll affordance to horizontally-scrolling recommendation rows.
- Fixed a confusing "not every unit is free" availability message and mis-colored button in the staff Availability Chat; labeled guest self-service ("Direct") bookings correctly in the Bookings insight panel instead of "Unassigned"; hid the payroll given/pending toggle from Co-owner (view-only for that role).

## Guest Experience module (chronological, from `git log`)

1. `Add Guest Experience module: Digital Guidebook, AI Concierge, check-in guide`
2. `Guidebook: tabbed Guidebook+Booking hub, host/emergency/checkout/building info`
3. `Guidebook: add "Meet our team" — admin opt-in staff on guest guide`
4. `Add coupon/discount codes for the Guest Portal booking flow`
5. `Fix leaderboard cache blowing past Next's 2MB data-cache limit`
6. `Performance: cache unit/guidebook data on hot paths; add Guest Experience preview to the home page`
7. `Rebuild Guest Experience as an independent tile-based digital guidebook`
8. `Add Guest Feedback & Rewards: 5-step post-stay survey with instant vouchers`
9. `Guide hub: animated tile navigation + generated cover art for photo-less tiles`
10. `Use real cover photos for Nearby Food/Coffee/Grocery/Transportation/Emergency`
11. `Guide hub: denser responsive tile grid (4/row mobile, 5 tablet, 6 desktop)`
12. `Add real distance/hours/rating for Nearby places via Google Places API`
13. `Admin-visible booking IDs; new real thumbnails; Nearby Places backend enrichment`
14. `Digital Guidebook: premium interactive Nearby Places experience`

## Booking Engine hardening (chronological, from `git log`)

1. `Fix booking edit form silently discarding unsaved changes`
2. `Fix duplicate housekeeping cleaning-log/calendar entries per checkout`
3. `Booking form: only reset fields on a real successful save`
4. `Lock Booker field when a Booker edits their own booking`
5. `Fix check-availability false negatives; require check-out on booking`
6. `Calendar: drop today's already-passed check-ins from Upcoming check-ins`
7. `Booking insights: scope to own bookings for Booker role; clickable rows`
8. `Earnings: show attached receipt to approver; fully reset upload form`
9. `Bookings list: show checkout date on every row + same-day checkout badge`
10. `Calendar: fix dead Day/Night split-lane logic, always stack Night below Day`
11. `Dashboard: surface all open Auditor findings, not just Critical/Warning`
12. `Add Flexible stay type — same-day, real time-of-day overlap checking`
13. `Extend Flexible stay type to the Guest Portal booking flow`
14. `Add Facebook Messenger webhook endpoint`
15. `Bookers cancel (not delete) bookings; cancellation reverses commission`
16. `Commission triggers on paid, not checkout; add refund tracking + booking notes`
17. `Bookings tab: add Cancelled and Past due filters`
18. `Production-readiness pass: fix availability bug, harden booking API, cleanup`
19. `Fix critical double-booking race + double-click cancel/refund races`

## How to extend this file

Add a new entry under a dated or thematically-grouped heading whenever a change is significant enough to affect a user, an integration, the schema, or a business rule — not for every commit. Link to the relevant doc section rather than re-explaining the detail here.
