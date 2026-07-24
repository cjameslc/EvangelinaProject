# Performance

> Part of the [Evangelina's Staycation documentation](README.md). Reflects a real review of this codebase's actual query patterns, not a generic checklist — see method note at the end.

- [Database & query review](#database--query-review)
- [Caching](#caching)
- [Dependency audit](#dependency-audit)
- [Bundle/runtime](#bundleruntime)
- [Scale reality check](#scale-reality-check)

## Database & query review

**Indexes**: every non-trivial `findMany`/`findFirst` filter path in the codebase has a matching index — cross-checked field by field against `schema.prisma`'s `@@index` declarations. No gap found. Full table in [Database.md](Database.md#indexes).

**N+1 patterns**: searched for `prisma.*` calls nested inside `for`/`.map(async ...)` loops across `src/app` and `src/lib`. Found several (`housekeeping/bills`, `my-earnings` achievement seeding, `weekly-expenses` payroll-rule generation, `gamification.ts`'s award upserts, `recurringExpenses.ts`, `icalSync.ts`) — all loop over small, bounded, fixed-size collections (a handful of employees, bill templates, or calendar events per sync), not scaling with total row count. None found to be a real N+1 against an unbounded dataset.

**Heavy pages already parallelized**: `/dashboard` runs 14+ independent queries through a single `Promise.all` using a round-robin connection pool (`prismaPool[n]`) specifically so parallel requests against Turso (an HTTP-based database) aren't serialized behind one connection. `take: 500`/`take: 300` caps bound the largest queries.

**Over-fetching**: base64/photo fields (`proofUrl`, `dpProofUrl`, receipt images) are explicitly excluded via `select` on every list-page query that doesn't display them — flagged in the code's own comments as a fix for a real, previously-measured page-payload bloat (one earlier version of the Bookings page was pulling 6MB+ of unused receipt images for a business with a literal handful of bookings).

**Verdict**: no new query-level issues found beyond what's fixed as part of this pass (see [Security.md](Security.md#security-headers) for the one adjacent config fix — the image-optimizer SSRF surface). The codebase already reflects real, deliberate optimization work from its development history.

## Caching

See [Architecture.md](Architecture.md#caching-strategy) for the full pattern. Summary: `unstable_cache` on slow-changing config reads (60s TTL), with base64/photo fields always excluded from the cached payload and merged in via a separate uncached query — this exact pattern is what fixed a real production incident (a cached endpoint silently failing to write once a payload crossed Next's 2MB per-entry data-cache limit).

## Dependency audit

`npm audit` (production dependencies) flags **Next.js 14.2.35** for a long list of advisories, and a transitive **PostCSS** vulnerability pulled in by it. Checked applicability against this app's actual usage rather than treating the raw advisory count as the finding:

| Advisory category | Applies to this app? |
|---|---|
| Server Actions DoS/SSRF | No — zero `"use server"` usage found anywhere in the codebase |
| i18n Middleware bypass | No — no i18n configuration |
| CSP nonce XSS in `beforeInteractive` scripts | No — no such scripts used |
| Image Optimizer DoS via `remotePatterns` | **Yes — was applicable and has been fixed** (see [Security.md](Security.md#security-headers)) |
| WebSocket upgrade SSRF | No — no WebSocket usage |
| Various cache-poisoning/request-smuggling (framework-internal) | Can't be mitigated from application code — require the framework's own patch |

No stable Next.js 14.x release exists beyond 14.2.35 (checked via `npm view next versions`) — a real fix for the framework-internal advisories requires moving to Next 15 or 16, both of which carry genuine breaking changes (async `cookies()`/`headers()` APIs, minimum React version bumps, etc.) against this app's App Router usage. **Deliberately not performed** as part of this documentation/hardening pass — recommended as its own separately-scoped, separately-tested project. See [Future-Enhancements.md](Future-Enhancements.md).

## Bundle/runtime

Not independently profiled with a browser performance trace as part of this pass (see the method note below) — but structurally: routes are already split by Next's App Router per-page code splitting; the one deliberately isolated `any`-typed module (`loadGoogleMaps.ts`) avoids pulling in `@types/google.maps` for a single usage site; heavy libraries (`jspdf`, `xlsx`, `qrcode`) are dynamically `import()`ed only where actually used (export/QR generation), not in the main bundle.

## Scale reality check

This is a **5-unit** property with, at the time of writing, on the order of **30 real booking rows** in the database. The "thousands of bookings / concurrent users / stress test" scenario requested as part of the original spec for this pass was **not performed** — there is no tooling in this environment to safely generate and then clean up that volume of synthetic data against the real production database, and the architecture reviewed above (indexed queries, bounded `take` limits, a distributed SQLite backend) is the same shape that would carry that load; it was not empirically verified at that scale. If real growth approaches that range, re-run this review against production `EXPLAIN QUERY PLAN` output rather than assuming continued headroom.

## Method note

This review was done by reading the actual query code and schema, not by running a live load-testing tool or a browser profiler (Lighthouse/DevTools trace) against a running instance — those tools weren't available/appropriate to run against the live production deployment in this environment. Where a claim above couldn't be empirically measured, it's stated as a structural/code-level observation, not a benchmarked number.
