# User Guide

> Part of the [Evangelina's Staycation documentation](README.md). Practical walkthroughs — for the underlying rules, see [Business-Rules.md](Business-Rules.md); for a specific page's purpose, see [Admin-Portal.md](Admin-Portal.md).

- [For guests](#for-guests)
- [For staff](#for-staff)

## For guests

### Browsing without an account

Visit the site — you land on the Digital Guidebook hub. Everything except unit-specific secrets (WiFi, door code) is visible without signing in: amenities, house rules, nearby places, reviews, FAQs, contact info.

### Booking a stay

1. Tap **Book a unit** (or go to `/book`).
2. Pick a date and stay type (Daycation, Night, or Full — see [Business-Rules.md](Business-Rules.md#stay-types)); available units and their real prices appear.
3. Fill in your details, choose full payment or a down payment, optionally enter a coupon code.
4. Submit — you're signed in automatically, no separate login step.
5. Upload a payment screenshot on the next step. You'll see one of three outcomes: approved instantly, held for a quick manual review, or rejected with a specific reason (never silently ignored).
6. Your **booking ID** (e.g. `EVA-7K2M9X`) is shown — save it. It's your sign-in code and what unlocks your unit's WiFi and door code.

### Signing in later

`/guest-login` — either request an email magic link, or sign in directly with your email + booking ID.

### Getting your WiFi password / door code

Open the **WiFi** or **Check-In Guide** tile. Even though you're signed in, you'll be asked to re-enter your booking ID once more before the actual password/code is shown — this is intentional (see [Security.md](Security.md#wifidoor-code-reveal-gate)), not a bug.

### If your booking ID stops working

Booking IDs are valid through your stay plus a short grace period after checkout — not forever. If yours has expired and you still need access, contact the host; an Owner/Admin can reactivate it or issue you a new one from their side.

### Managing your booking

`/my-bookings` — see all your stays, tap into any one for its full Digital Guidebook + payment/invoice tab. You can cancel (with a reason) or raise a request (housekeeping, late checkout, extend stay, report an issue) from there.

## For staff

### Signing in

`/login` with your username and password. First login after an account is created may force a password change.

### What you see depends on your role

See the [role table](Business-Rules.md#roles--permissions). If a page/tab doesn't appear in your navigation, your role doesn't have access to it — this isn't a bug.

### Logging a booking (Booker, Housekeeping, Co-owner, Owner/Admin)

`/bookings` → **Add booking** (or use the Availability Chat to check a date first). Fill in unit, dates, stay type, guest info, platform, and payment details. You'll see your own name pre-filled as booker if you're a Booker.

### Checking availability quickly

The Availability Chat panel on `/bookings` — ask for a date/unit/stay type combination; it tells you what's free, and if your exact request isn't available, shows genuinely free alternatives (same day, other units) with a **Log this booking** shortcut.

### Running housekeeping

`/housekeeping` — see each unit's current status, work through the cleaning checklist, log start/end times, take photos, and clock in/out.

### Checking your own pay

`/earnings` — your own commission/day-rate/salary breakdown for the current period, regardless of role.

### Admin tasks (Owner/Admin only)

`/admin` — units, staff accounts, bills/supplies, feedback review, and all site settings (rates, Guest Experience content, coupons, checklist templates). See [Admin-Portal.md](Admin-Portal.md) for the full tab-by-tab breakdown.

### Reactivating or reissuing a guest's booking ID

`/bookings` → edit the booking → the Booking ID banner shows Active/Expired status and, if you're an Owner/Admin, **Reactivate** and **Generate new code** buttons.
