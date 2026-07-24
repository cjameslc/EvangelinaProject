# Guest Experience (Digital Guidebook)

> Part of the [Evangelina's Staycation documentation](README.md). Account/auth/booking-management is [Guest-Portal.md](Guest-Portal.md) — this document covers the informational/self-service guidebook content itself.

- [Overview](#overview)
- [The hub page](#the-hub-page)
- [WiFi & door code (secure reveal)](#wifi--door-code-secure-reveal)
- [Nearby places](#nearby-places)
- [Guest Reviews](#guest-reviews)
- [AI Concierge](#ai-concierge)
- [Other guidebook pages](#other-guidebook-pages)
- [Admin-editable content](#admin-editable-content)

## Overview

The Digital Guidebook (`/` and `/guide/*`) is the guest-facing default landing page — completely independent of the booking flow (`/book`). A signed-out visitor sees the same hub and can browse everything except unit-specific secrets (WiFi/door code); a signed-in guest with an active booking additionally sees their own stay's details woven into the relevant pages.

## The hub page

`src/components/guest/GuideHubView.tsx`, rendered by `src/app/page.tsx`. A 4-section, 4-tiles-per-section image tile grid (fixed 4 columns at every breakpoint — every section ships with exactly 4 tiles, so more columns would just leave empty tracks; tiles grow larger via widening container/gaps on desktop instead):

| Section | Tiles |
|---|---|
| **Get started** | Welcome, WiFi 🔒, Check-In Guide 🔒, Location |
| **Your stay** | House Manual, Amenities, Gallery, Checkout Guide 🔒 |
| **Explore the neighborhood** | Nearby Food, Coffee Shops, Grocery, Transportation, Hospitals, Schools, Nightlife, Concerts & Theater |
| **Support** | Guest Reviews, FAQs, Contact Host, Emergency |

(🔒 = shows real per-unit secrets only to a guest with an active booking.)

The four "Explore the neighborhood" tiles that have real refreshed Google Places data (see [Nearby places](#nearby-places)) show a small badge with the real walking/driving time to the **nearest** place in that category, computed from the property's own coordinates — a category with no refreshed data yet simply has no badge.

## WiFi & door code (secure reveal)

The single most security-sensitive piece of guest content, and the one place this app's normal "signed-in guest sees their own data" pattern is deliberately **not** enough on its own:

- The server **never sends the raw WiFi password or door code** to the client on page load — not even to a signed-in guest with a confirmed active booking. The page only knows (and shows) *whether* one exists.
- To actually reveal it, the guest re-enters their **booking confirmation number** into a small form (`SecureWifiCard`/`SecureDoorCodeCard` in `src/components/guest/SecureGuideCards.tsx`), which POSTs to `/api/guest/wifi` or `/api/guest/door-code`. Only on a match does the server return the real value.
- The property has 5 units, each with its own code — this doubles as a "confirm which stay you mean" step, not just friction for its own sake.
- The **AI Concierge is bound by the same rule** — it's told only whether a code exists, never the value, and is instructed to point the guest at these same pages (see [AI Concierge](#ai-concierge); this was tightened during the writing of this documentation set — see [Changelog.md](Changelog.md)).
- The reveal is further gated by [confirmation-number validity](Business-Rules.md#booking-id-confirmation-number-validity) — an expired code doesn't work even if it's typed correctly, unless an OWNER_ADMIN has reactivated it.

Full technical detail in [Security.md](Security.md#wifidoor-code-reveal-gate).

## Nearby places

`/guide/nearby/[category]` — food, coffee, grocery, transportation, hospitals, schools, nightlife, concerts & theater. Backed by real Google Places data (`PlaceInsight` model), refreshed **only** on an Admin button-click (never on a schedule — each refresh is a real, billed API call sequence: Find Place → Details → Distance Matrix × 2 modes → an AI-generated host-voice blurb). See [Integrations.md](Integrations.md#google-places-api).

Each place card shows, only for what's actually been fetched: real photo (proxied through `/api/places/photo`, never a direct client→Google request), rating + review count, distance, walking/driving minutes, today's hours, open/closed status, price level, phone/website, and Maps/Directions/Grab/Favorite/Share actions. A place with no refreshed data yet omits those fields entirely rather than guessing.

The "Concerts & Theater" category additionally links out to a live Google search for "what's on now" at Smart Araneta Coliseum, rather than maintaining an in-app events calendar this app has no reliable data source for.

## Guest Reviews

`/guide/reviews` — real guest testimonials and an aggregate rating figure, supplied directly by the business (sourced from its actual Airbnb/Google listings), stored as static content in `src/lib/guidebookContent.ts` (`REVIEW_SUMMARY`, `GUEST_REVIEWS`). **Not** admin-editable from the UI and **not** fabricated — update the source file directly when new real reviews come in.

## AI Concierge

`src/components/guest/AIAssistantWidget.tsx` → `POST /api/guest/assistant` → `src/lib/ai/assistantService.ts` (Google Gemini). Strictly grounded in real, freshly-fetched data (`assistantContext.ts`) — the system prompt explicitly forbids inventing prices, dates, availability, amenities, house rules, or neighborhood places not present in the supplied context. If the assistant can't resolve a question from real data, it emits an escalation marker and the guest can request a human follow-up (`AssistantEscalation` model, `POST /api/guest/assistant/escalate`).

## Other guidebook pages

| Page | Content |
|---|---|
| `/guide/welcome` | Landing/orientation |
| `/guide/check-in` | Numbered check-in steps + the door-code reveal card |
| `/guide/check-out` | Checklist + a fixed thank-you note from the host |
| `/guide/amenities` | Real in-unit amenity list |
| `/guide/house-manual` | Rates, parking, house rules, building facilities |
| `/guide/gallery` | Real unit photo tour |
| `/guide/location` | Getting to Urban Deca Towers Cubao — Maps/Waze/Grab links |
| `/guide/faqs` | Admin-managed categorized Q&A |
| `/guide/contact` | Host contact number/Messenger + admin-managed named staff contacts (e.g. Housekeeping, maintenance) |
| `/guide/emergency` | National emergency hotline + admin-managed named emergency contacts |
| `/guide/feedback/[bookingId]` | Post-stay survey (see [Business-Rules.md](Business-Rules.md#guest-feedback-rewards)) |

## Admin-editable content

Most guidebook content overrides live on the `Settings` singleton row (JSON-in-TEXT fields — see [Database.md](Database.md#the-json-in-text-pattern)), editable from Admin → Settings: `guidebookCategories`, `amenities`, `houseRules`, `faqs`, `emergencyContacts`, `staffContacts`, `celebrationPackageItems`, host name/bio/photo, contact numbers, and the property's `propertyLat`/`propertyLng` (the origin every "distance from the property" figure is measured from). A `null` value always falls back to a sensible coded default (`src/lib/guidebookContent.ts`) rather than showing a placeholder.
