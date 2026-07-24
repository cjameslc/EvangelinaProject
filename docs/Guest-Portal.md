# Guest Portal

> Part of the [Evangelina's Staycation documentation](README.md). Guidebook content is [Guest-Experience.md](Guest-Experience.md); the booking flow itself is [Booking.md](Booking.md) — this document covers guest identity, authentication, and account-management pages.

- [Why a separate auth system](#why-a-separate-auth-system)
- [The Guest model](#the-guest-model)
- [Sign-in methods](#sign-in-methods)
- [Session mechanics](#session-mechanics)
- [Account pages](#account-pages)
- [Notifications](#notifications)

## Why a separate auth system

Staff and guests are two entirely separate identity systems that share **no session, no cookie, and no code path**:

| | `User` (staff) | `Guest` |
|---|---|---|
| Auth library | NextAuth v4 | Custom (`src/lib/guestSession.ts`) |
| Credential | username + bcrypt password | none — email-only, passwordless |
| Session cookie | `next-auth.session-token` | `guest-session-token` |
| JWT secret | `NEXTAUTH_SECRET` | `GUEST_SESSION_SECRET` |
| Scope | Internal staff pages, role-gated | Public/guest pages only |

This was a deliberate choice, not a historical accident — using NextAuth's own database-adapter machinery for guest email login would have required migrating the existing JWT-only staff auth onto an adapter-based session model just to add a second, much simpler credential type. A guest is a `Guest` row (email, name, phone, notification preference) — never a `User` row, never assigned a role, and can never reach a staff page.

## The Guest model

`Guest` (`prisma/schema.prisma`) — `id`, `email` (unique), `name`, `phone`, `emailNotifications`, timestamps. Created automatically on first successful magic-link verification or guest booking (`findOrCreateGuestByEmail`) — there is no separate "sign up" step.

## Sign-in methods

Two independent paths, both landing on `/guest-login`:

### 1. Email magic link

1. Guest enters their email → `POST /api/guest/auth/request-link`.
2. A `GuestLoginToken` row is created (15-minute TTL, single-use) and emailed via Resend.
3. Guest clicks the link → `GET /api/guest/auth/verify?token=...` → token is marked used, a session is minted, guest is redirected to `/my-bookings`.
4. Rate-limited both by requesting IP and by target email, and the response is **identical regardless of outcome** (valid email, unknown email, send failure) — this endpoint must never be usable to enumerate which emails have an account.

### 2. Email + booking confirmation number

1. Guest enters email + their booking's confirmation number (`EVA-XXXXXX`) → `POST /api/guest/auth/verify-confirmation`.
2. Looked up by the confirmation number's real DB uniqueness; the email must match the booking's guest, and the code must currently be **valid** (see [Business-Rules.md](Business-Rules.md#booking-id-confirmation-number-validity) — an expired code fails here too, same as it does for the WiFi/door-code reveal).
3. On any mismatch (wrong code, wrong email, expired, cancelled booking), the **same generic error** is returned regardless of which part was wrong — no enumeration signal.
4. Rate-limited by IP.

### 3. Automatic sign-in at booking time

Completing the guest self-service booking flow (`POST /api/guest/bookings`) mints and sets the session cookie **immediately** on success — a brand-new guest doesn't have to separately sign in via either method above just to reach the payment step or `/my-bookings`.

## Session mechanics

`src/lib/guestSession.ts`:
- `mintGuestSessionToken(guest)` — signs a JWT (via `next-auth/jwt`'s `encode()`, reused as a general JWT helper even though this isn't a NextAuth session) with `GUEST_SESSION_SECRET`.
- `getCurrentGuest()` — reads/verifies the `guest-session-token` cookie server-side; returns `null` if absent/invalid/expired. Called independently at the top of every guest-facing page and API route — there is no middleware-level gate for guest routes (unlike staff routes), so each route is individually responsible for checking.
- Sign-out (`POST /api/guest/auth/signout`) simply clears the cookie.

## Account pages

| Page | Purpose |
|---|---|
| `/guest-login` | Both sign-in methods, tabbed |
| `/my-bookings` | List of the guest's own bookings (past + upcoming) |
| `/my-bookings/[id]` | Per-booking hub — tabbed **Guidebook** (WiFi/door code/amenities/nearby, scoped to that unit) and **Booking** (payment status, invoice, cancel, upload proof) |
| Profile fields | Name, phone, email-notification opt-out — `PATCH /api/guest/profile` |

Every guest-facing data query is scoped by `guestId` (never by `bookingId` alone) — a guest can never view or act on another guest's booking, even with a guessed/enumerated booking id. See [Security.md](Security.md#idor-protection) for how this is enforced.

## Notifications

`GuestNotification` rows are created by `notificationService.notify()` (`src/lib/bookingEngine/notificationService.ts`) on: `booking.created`, `booking.updated`, `booking.cancelled`, `payment.received`, plus (defined but not yet confirmed as actively scheduled) `checkin.reminder`/`checkout.reminder` event types. Guest-facing endpoints: `GET /api/guest/notifications` (list), `POST /api/guest/notifications/read` (mark read), `GET /api/guest/notifications/unread-count` (badge count). This is in-app only — the `public/sw.js` service worker has empty `push`/`notificationclick` stubs, so there is **no actual push-notification delivery** wired up yet (see [Future-Enhancements.md](Future-Enhancements.md)).
