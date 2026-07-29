# Social Media Center

> Part of the [Evangelina's Staycation documentation](README.md). Covers `/social` — real availability turned into ready-to-post graphics, captions, and quick-reply tools. Not gated to Admin; see [Admin-Portal.md](Admin-Portal.md#staff-page-map).

- [Overview](#overview)
- [Content Studio tab](#content-studio-tab)
- [Available Dates tab](#available-dates-tab)
- [Captions & Hashtags tab](#captions--hashtags-tab)
- [Guest Reply Cheat Sheet tab](#guest-reply-cheat-sheet-tab)
- [Brand Kit](#brand-kit)
- [Exported graphic design](#exported-graphic-design)
- [Real-data guarantees](#real-data-guarantees)

## Overview

`src/app/social/page.tsx` → `SocialMediaView.tsx`, four tabs. Every "available" date, price, and photo shown here is computed from the same live booking data the rest of the app uses — see [Real-data guarantees](#real-data-guarantees) — so a promo graphic can never promise a date that's actually already booked.

Access: `canSeeSocialMedia()` (`src/lib/rbac.ts`) always returns `true` — every role (Booker, Housekeeping, Auditor, Owner/Admin, Co-owner) can reach this page.

## Content Studio tab

The main workspace (`ContentStudioWorkspace.tsx`):

- **Rail** — one card per unit (`UnitOpportunityCard.tsx` / `UnitGraphicPreview`), each showing the unit's real photo, an urgency badge ("Available Today" / "Only N Dates Left", from `scarcityFor()`), the unit name, and its cheapest per-stay-type price. Clicking a card selects it for the large preview. The rail tile intentionally shows *less* than the large preview — unit name (clamped to 2 lines) plus one price line — to leave room for the badge without the two colliding on a compact card.
- **Large preview** — the same real photo/overlay/badge treatment, larger, with the full per-stay-type date breakdown and price lines.
- **Caption editor** (`CaptionEditor.tsx`) — platform (Facebook/TikTok/Instagram Feed/Story/Threads/X), style (Promotional/Urgency/Friendly/Luxury), toggles for what to include (price, amenities, promo, booking link, contact details, unit number), an AI "Generate caption" action, and a copyable AI-image-prompt field for pairing with an external image generator.
- **Export panel** (`ExportPanel.tsx`) — format (7 presets: Instagram Feed/Portrait/Story, Facebook Post, TikTok, Threads, Square Post, or Custom), quality tier (Standard/High/Ultra HD — resolution scale + compression), file format (PNG/JPG/WebP/PDF), and toggles (Logo, Watermark, Contact details, QR code linking to `/book`).
- **Design Review Checklist** (`DesignReviewChecklist.tsx`) — live pass/fail checks run against the actual canvas before export is enabled (does every date line fit without truncation, do overlays have enough room) — not a static checklist, reads `hiddenDateCount` back from the draw function itself.

Quick date-range filters above the rail (Today/Tomorrow/This Weekend/This Week/Next Week/This Month/Custom Range) scope which dates count as "open" for the whole tab. **Custom Range cannot select a date before today** — both a `min` on the date inputs and a server-side floor in `quickFilterRange()`, so a promo can't be generated for an already-elapsed date.

## Available Dates tab

A month calendar (`computeMonthAvailability()`, `src/lib/socialAvailability.ts`) color-coded available/partially-reserved/fully-booked, with unit and stay-type filters, plus "Download ready-to-post graphics" (the 7 format presets) and PDF/Excel export of the same data.

**Never shows past dates.** Elapsed days of the current month are greyed out and excluded from the stat counts and every exported date line (`futureMonthDays` filter, `>= todayIso`); "Previous month" is disabled once you're back at the current month — this tool is for forward-looking promotion, not a historical report (that's [Analytics](Business-Rules.md)).

## Captions & Hashtags tab

Template-based caption generation (`socialContent.ts`) independent of a specific unit — property-wide messaging, hashtag sets.

## Guest Reply Cheat Sheet tab

`CheatSheetTab.tsx` — quick-reply snippets for common guest DMs, sourced from the real Master FAQ (Settings' Guest Experience FAQ content), not a separately-maintained copy.

## Brand Kit

Configured in Admin → Settings → Brand Kit (see [Admin-Portal.md](Admin-Portal.md#settings-tab)): a logo, primary/secondary hex colors, and social handles. All optional — every exported graphic falls back to the static `/branding/logo.jpg` and the original rausch-pink/maroon (`#FF385C` / `#B0203A`) gradient when unset, so nothing breaks for a property that never opens the panel.

## Exported graphic design

`src/lib/socialGraphic.ts` renders every downloadable graphic on an off-screen `<canvas>` — no server-side image generation, no external design tool.

- **Typography** — Fraunces (serif display, for headlines) and Manrope (body/labels), self-hosted as static `.woff2` files under `public/fonts/` and loaded via the CSS Font Loading API (`ensureGraphicFonts()`). Deliberately **not** a Google Fonts `<link>` — this app's CSP (`font-src 'self'`, `style-src 'self' 'unsafe-inline'`, see [Security.md](Security.md)) silently blocks an external fonts stylesheet with no visible error beyond a CSP console violation, which a canvas draw call has no way to surface — confirmed live during development. Every caller of `drawAvailabilityGraphic`/`drawUnitGraphic` must `await ensureGraphicFonts()` first.
- **`drawAvailabilityGraphic`** (Available Dates tab's exports) — warm cream background, a real photo of the property's current best-availability unit as the hero image (never an invented/stock photo — omitted entirely, not faked, if no unit has a photo), icon-labeled sections per open stay type (procedurally-drawn sun/moon/clock glyphs, not image assets) each with its real date list and a short marketing line, a pill badge, and a solid brand-color CTA footer. Header/hero sizing adapts to the canvas aspect ratio (a `hs` compact-format scale factor) — the square (1080×1080) format has much less vertical room than the story format (1080×1920) at the same width, and a fixed-size layout tuned for one broke the other (the card collapsed to zero height and its content was silently painted over by the footer bar) before this was accounted for.
- **`drawUnitGraphic`** (Content Studio's per-unit exports) — photo-first hero (the unit's real photo, dark gradient overlay for text legibility), badge, wrapped/truncated unit name and date list (never runs off-canvas regardless of name length), per-stay-type prices, CTA, optional QR/watermark.
- Every text block that can vary in length (unit names, date lists) wraps and truncates against a real boundary rather than assuming it fits — a past, confirmed bug had an unwrapped unit name run off the canvas edge.
- No emoji are ever drawn into canvas text — `fillText`'s emoji rendering is unreliable cross-platform (confirmed: rendered as a broken OS fallback glyph on a real environment). Plain bullets/labels are used instead everywhere.

## Real-data guarantees

- **Availability** — `computeUnitOpportunities()`/`computeMonthAvailability()` (`src/lib/socialOpportunity.ts`, `socialAvailability.ts`) both call `bookingsConflict()`/`occupiedRange()` from `src/lib/stayRange.ts`, the exact same functions the live booking-conflict checker and the Bookings Schedule grid use — never a second, looser definition of "open."
- **Pricing** — `pricesByStayType()`/`priceLinesFor()` always show one labeled price per stay type ("Daycation from ₱1,499", "Night stay from ₱1,349"), never a single blended `Math.min()` across every stay type and day. That blended form previously surfaced a weekday-night-promo-discounted rate under a generic "From ₱X" label with no indication it was Night-only — a real, confirmed source of confusion, not a cosmetic nitpick.
- **Photos** — every photo drawn into an export is a real unit photo (`Unit.photoUrl`, uploaded via Vercel Blob) or the configured Brand Kit logo. Nothing here is AI-generated or stock imagery.
