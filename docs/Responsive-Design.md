# Responsive Design

> Part of the [Evangelina's Staycation documentation](README.md).

- [Breakpoints](#breakpoints)
- [Navigation pattern](#navigation-pattern)
- [Guide hub tile grid](#guide-hub-tile-grid)
- [Horizontal-scroll rows](#horizontal-scroll-rows)
- [General conventions](#general-conventions)

## Breakpoints

Standard Tailwind CSS breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px) — no custom breakpoint scale defined in `tailwind.config.ts`. Design approach throughout the codebase is **mobile-first**: base (unprefixed) classes target the smallest screen, `sm:`/`md:`/`lg:` progressively enhance for larger viewports.

## Navigation pattern

Two separate nav components, never both visible at once:

| Component | Visible | Breakpoint logic |
|---|---|---|
| `BottomNav.tsx` | Mobile | Shown by default, `md:hidden` |
| `Navbar.tsx` | Tablet/desktop | Its staff-nav-item row is `hidden md:flex`; a mobile-only condensed user info row inside the account menu is `sm:hidden` |

## Guide hub tile grid

`GuideHubView.tsx` (the Digital Guidebook landing page) is a concrete example of a real responsive bug found and fixed in this codebase's history, worth documenting as the established pattern to follow: every section in `GUIDE_SECTIONS` ships with **exactly 4 tiles**. An earlier version used `grid-cols-4 md:grid-cols-5 lg:grid-cols-6` — which, given content that never exceeds 4 items per row, left **empty trailing grid tracks** on tablet/desktop rather than actually using the extra space, reading as "the site isn't using its space" on a wide screen. Fixed by keeping the column count **fixed at 4** for every breakpoint and instead widening the container's `max-width` and `gap` at larger breakpoints, so the same 4 tiles grow larger and fill the row rather than a rigid column count creating dead space. **The lesson generalizes**: match column count to actual (bounded, known) content count, not to "more space available."

## Horizontal-scroll rows

Several UI patterns (Guest tips, "Personalize your guide" recommendation cards) are horizontally-scrolling card rows (`overflow-x-auto`) with the scrollbar hidden (`.scrollbar-none` utility in `globals.css`) for a cleaner look. This has a real discoverability cost on a desktop mouse with no trackpad and no visible scrollbar — a card cut off at the container edge can read as "missing" rather than "scroll for more." The established fix, `src/components/guest/HScrollRow.tsx`: an edge fade gradient that only shows on whichever side still has hidden content (computed from `scrollLeft`/`scrollWidth`), plus a `wheel` event handler that redirects vertical mouse-wheel scroll into horizontal `scrollLeft` movement when the pointer is over the row and it can still scroll further in that direction. Reused by every horizontal-scroll row rather than each one reimplementing this.

## General conventions

- **Modals** (`components/ui/Modal.tsx`) are full-screen on mobile, centered dialogs on larger screens.
- **Tables** on data-heavy staff pages (Bookings, Analytics) generally collapse to a card/list layout below `md`, rather than a horizontally-scrolling table.
- **Forms** (`BookingForm`, `BookFlowView`) stack to a single column below `sm:`, `grid-cols-2` at `sm:` and above.
- **Line-clamping** (`line-clamp-2`, etc.) is used on tile titles/descriptions rather than allowing text to overflow a fixed-height card.
- **Touch targets**: interactive elements in guest-facing mobile UI generally target a minimum ~36–44px tap area (buttons/pills sized with `py-2`/`py-2.5` or larger).

Not independently verified against a real Safari/Firefox engine or a physical device lab as part of this documentation pass — see [Performance.md](Performance.md#method-note) for the same caveat applied to performance claims. Development/testing in this project has used Chromium via Playwright plus manual review of rendered screenshots at a range of viewport widths.
