# Evangelina's Staycation — Documentation

A 5-unit short-term rental property-management app for Evangelina's Staycation (Urban Deca Towers, Cubao, Quezon City, Philippines) — staff operations (bookings, calendar, housekeeping, payroll, analytics) plus a full guest-facing Digital Guidebook and self-service booking flow.

**This documentation reflects the codebase as actually implemented**, verified by direct inspection while writing it — not a specification of intended behavior. Where something couldn't be confirmed from the code, it's explicitly marked **Not Yet Implemented** or **Unable to Determine from Current Codebase** rather than assumed.

## Start here

| If you want to... | Read |
|---|---|
| Understand the system at a glance | [Architecture.md](Architecture.md) |
| Get a dev environment running | [Installation.md](Installation.md) |
| Deploy or find the cron/env setup | [Deployment.md](Deployment.md), [Configuration.md](Configuration.md) |
| Understand the database | [Database.md](Database.md) |
| Look up an API route | [API.md](API.md) |
| Understand a business rule (pricing, commission, roles) | [Business-Rules.md](Business-Rules.md) |
| Learn how to use the app (staff or guest) | [User-Guide.md](User-Guide.md) |
| Something's broken | [Troubleshooting.md](Troubleshooting.md) |

## Full index

### System

- [Architecture.md](Architecture.md) — tech stack, request flow, the two auth systems, the Booking Engine, caching
- [Folder-Structure.md](Folder-Structure.md) — real repository layout
- [Database.md](Database.md) — all 26 models, indexes, migrations
- [API.md](API.md) — every API route, method, auth requirement, purpose
- [Configuration.md](Configuration.md) — environment variables
- [Integrations.md](Integrations.md) — Google Maps/Places, Gemini, Airbnb iCal, Vercel Blob, Resend, Messenger, NextAuth

### Features

- [Business-Rules.md](Business-Rules.md) — roles, pricing, commission, payroll, Elite Booker Challenge, booking-ID validity
- [Booking.md](Booking.md) — the booking lifecycle end to end
- [Guest-Experience.md](Guest-Experience.md) — the Digital Guidebook, WiFi/door-code reveal, nearby places, AI Concierge
- [Guest-Portal.md](Guest-Portal.md) — guest identity, sign-in, account pages
- [Admin-Portal.md](Admin-Portal.md) — the staff app, `/admin` tab by tab

### Quality & operations

- [Security.md](Security.md) — a real audit of this codebase's security posture, fixes made, gaps disclosed
- [Performance.md](Performance.md) — database/query review, dependency audit
- [Responsive-Design.md](Responsive-Design.md) — breakpoints, real responsive bugs fixed
- [Installation.md](Installation.md) · [Deployment.md](Deployment.md)
- [User-Guide.md](User-Guide.md) · [Troubleshooting.md](Troubleshooting.md) · [Maintenance.md](Maintenance.md)

### Reference

- [Future-Enhancements.md](Future-Enhancements.md) — genuine known gaps and deferred work
- [Glossary.md](Glossary.md)
- [Changelog.md](Changelog.md)

## A note on the root `README.md`

The `README.md` at the repository root predates most of this documentation and describes an earlier Postgres/Neon-based version of the app. It has been updated to point here rather than rewritten in full — this `/docs` directory is the current source of truth. See [Folder-Structure.md](Folder-Structure.md#known-inaccuracies-in-root-level-files) for what specifically is stale there.
