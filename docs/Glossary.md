# Glossary

> Part of the [Evangelina's Staycation documentation](README.md).

| Term | Meaning |
|---|---|
| **Booking ID / confirmation number** | The `EVA-XXXXXX` code generated for every booking — used for guest login and to gate the WiFi/door-code reveal. See [Business-Rules.md](Business-Rules.md#booking-id-confirmation-number-validity). |
| **Booker** | Staff role that logs bookings; also the name of the `Employee` who logged a specific booking (`Booking.bookerId`). |
| **CalendarBlock** | The mirrored occupancy row that actually renders on `/calendar`, kept in sync with a `Booking`. See [Database.md](Database.md#models). |
| **Co-owner (`CO_OWNER`)** | A staff role scoped to only their assigned units (`UnitOwner`), otherwise same feature access as Owner/Admin. |
| **Confirmation number** | See *Booking ID*. |
| **Daycation** | A 12-hour, same-day stay type. |
| **Direct (platform)** | The `Booking.platform` value used specifically for guest self-service bookings made through the site (as opposed to Airbnb, TikTok, Facebook, Walk-in, or Other). |
| **Down payment (DP)** | A partial payment (flat fee, `Settings.dpFee`) a guest can pay to secure a booking instead of the full amount upfront. |
| **Elite Booker Challenge** | Monthly, company-wide booking-count milestone bonus program with limited slots per tier. See [Business-Rules.md](Business-Rules.md#elite-booker-challenge). |
| **Flexible (stay type)** | A same-day, staff-only stay type with a guest/staff-chosen check-in/out time rather than a fixed window. |
| **Full stay** | A 21-hour stay type. |
| **Guest** | A guest-portal account (`Guest` model) — email-only identity, entirely separate from a staff `User`. See [Guest-Portal.md](Guest-Portal.md). |
| **Guest Experience** | The umbrella term (used throughout the codebase's own comments) for the Digital Guidebook, WiFi/door-code reveal, and related guest-facing informational content. See [Guest-Experience.md](Guest-Experience.md). |
| **JSON-in-TEXT pattern** | This app's convention for storing array/object data in a SQLite `TEXT` column as JSON, transparently (de)serialized by a Prisma Client Extension. See [Database.md](Database.md#the-json-in-text-pattern). |
| **Night (stay type)** | A 12-hour stay type; the only type eligible for the weekday-night promo. |
| **Owner/Admin (`OWNER_ADMIN`)** | The top staff role — full access to every unit and every page, including `/admin`. |
| **PlaceInsight** | A cached row of real Google Places data (distance, rating, hours, photo) for one named nearby place. See [Integrations.md](Integrations.md#google-places-api). |
| **RBAC** | Role-Based Access Control — this app's permission model, defined in `src/lib/rbac.ts`. See [Business-Rules.md](Business-Rules.md#roles--permissions). |
| **Settings** | The singleton (`id = 1`) database row holding site-wide, admin-editable configuration. See [Database.md](Database.md#models). |
| **Turso / libSQL** | The distributed, SQLite-compatible database this app runs on. See [Database.md](Database.md#provider--connection). |
| **Unit** | One of the 5 physical rental rooms at Urban Deca Towers Cubao. |
| **Urban Deca Towers Cubao** | The physical building all 5 units are located in — the property itself, in Cubao, Quezon City. |
