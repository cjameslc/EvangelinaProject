# 004 — Stop animating width/height directly; scope transition-all to transform+opacity

- **Status**: TODO
- **Commit**: 102fa08
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 7 files (~40 lines)

## Problem

Seven components animate a layout-triggering property (`width` or
`height`) via `transition-all`, forcing layout+paint+composite on every
change instead of a compositor-only `transform`:

```tsx
// src/components/housekeeping/CleaningTimer.tsx:50 — current (re-renders every ~30s via setInterval)
<div className={cn("h-full rounded-full transition-all")} style={{ width: `${progressPct}%`, background: colors }} />
```
```tsx
// src/components/bookings/OpportunityPanel.tsx:70 — current
<div className="h-full rounded-full bg-gradient-to-r from-rausch to-gold transition-all" style={{ width: `${goalPct}%` }} />
```
```tsx
// src/components/skins/SeasonalChallengeCard.tsx:52-53 — current
<div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${skin.colors.primary}, ${skin.colors.secondary})` }} />
```
```tsx
// src/components/shared/RevenueGoalsPanel.tsx:35-36 — current
<div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: bar ? undefined : "var(--skin-primary, #6c5ce7)" }} />
```
```tsx
// src/components/dashboard/sections/StayMixSection.tsx:25 — current
<div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
```
```tsx
// src/components/dashboard/sections/EarningsSection.tsx:301-302 — current
<div className={cn("w-full max-w-[36px] rounded-t-md transition-all group-hover:brightness-110", b.amount > 0 ? "dash-gradient-bar" : "bg-[var(--bg-2)]")} style={{ height: `${Math.max(4, Math.round((b.amount / max) * 80))}px` }} />
```

Also, separately, the app-wide Toast uses unscoped `transition-all` on an
element that fires on nearly every save/error across the app:

```tsx
// src/components/ui/Toast.tsx:24 — current
"fixed left-1/2 bottom-6 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-bold text-white shadow-card transition-all duration-200",
```

Its only animated properties are `translate-y`/`opacity` (line 26) — `box-shadow`
and everything else on it is static, so `transition-all` is animating
nothing extra today, but it's a latent risk (any future className added
to this element inherits animation for free, including layout properties)
and an explicit finding per AUDIT.md §5 ("transition: all — always a
finding").

## Target

For the 6 progress-bar/bar-chart sites: render the fill/bar at its full
(100%) size always, and use `transform: scaleX()` (width bars,
`transform-origin: left`) or `transform: scaleY()` (the height bar,
`transform-origin: bottom`) to represent the percentage instead of
resizing the box itself:

```tsx
/* target — width-based progress bars (5 sites), CleaningTimer shown as example */
<div
  className="h-full w-full origin-left rounded-full transition-transform duration-300"
  style={{ transform: `scaleX(${progressPct / 100})`, background: colors }}
/>
```

```tsx
/* target — EarningsSection's height-based bar-chart column */
<div
  className={cn("w-full max-w-[36px] origin-bottom rounded-t-md transition-transform duration-300 group-hover:brightness-110", b.amount > 0 ? "dash-gradient-bar" : "bg-[var(--bg-2)]")}
  style={{ height: "80px", transform: `scaleY(${Math.max(4, Math.round((b.amount / max) * 80)) / 80})` }}
/>
```

For Toast: scope to the properties it actually animates.

```tsx
/* target */
"fixed left-1/2 bottom-6 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-bold text-white shadow-card transition-[transform,opacity] duration-200",
```

300ms for the progress-bar transforms matches this app's `.card`
transition-shadow duration (`globals.css:399`, 200ms) rounded up slightly
since these often represent a bigger visual jump (e.g. 0% to 60% on
load) — still comfortably under any "occasional UI" ceiling and consistent
with the general sub-300ms-for-interactive-elements guidance; 200ms is
kept for Toast since that's its existing, unchanged duration.

## Repo conventions to follow

- `cn()` from `@/lib/utils` is already imported and used in
  `CleaningTimer.tsx`, `RevenueGoalsPanel.tsx`, `EarningsSection.tsx` —
  keep using it for the conditional class composition, don't switch to
  template strings.
- Tailwind's `origin-left`/`origin-bottom` utilities are the existing
  convention for `transform-origin` elsewhere in this app (e.g.
  `ListingsGrid.tsx:124`'s `origin-center`) — use the utility class, not
  an inline `transformOrigin` style.

## Steps

1. `src/components/housekeeping/CleaningTimer.tsx:50` — replace:
   ```tsx
   <div className={cn("h-full rounded-full transition-all")} style={{ width: `${progressPct}%`, background: colors }} />
   ```
   with:
   ```tsx
   <div className="h-full w-full origin-left rounded-full transition-transform duration-300" style={{ transform: `scaleX(${progressPct / 100})`, background: colors }} />
   ```

2. `src/components/bookings/OpportunityPanel.tsx:70` — replace:
   ```tsx
   <div className="h-full rounded-full bg-gradient-to-r from-rausch to-gold transition-all" style={{ width: `${goalPct}%` }} />
   ```
   with:
   ```tsx
   <div className="h-full w-full origin-left rounded-full bg-gradient-to-r from-rausch to-gold transition-transform duration-300" style={{ transform: `scaleX(${goalPct / 100})` }} />
   ```

3. `src/components/skins/SeasonalChallengeCard.tsx:52-53` — replace:
   ```tsx
   <div
     className="h-full rounded-full transition-all"
     style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${skin.colors.primary}, ${skin.colors.secondary})` }}
   />
   ```
   with:
   ```tsx
   <div
     className="h-full w-full origin-left rounded-full transition-transform duration-300"
     style={{ transform: `scaleX(${pct / 100})`, background: `linear-gradient(90deg, ${skin.colors.primary}, ${skin.colors.secondary})` }}
   />
   ```

4. `src/components/shared/RevenueGoalsPanel.tsx:35-36` — replace:
   ```tsx
   <div
     className={cn("h-full rounded-full transition-all", bar)}
     style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: bar ? undefined : "var(--skin-primary, #6c5ce7)" }}
   />
   ```
   with:
   ```tsx
   <div
     className={cn("h-full w-full origin-left rounded-full transition-transform duration-300", bar)}
     style={{ transform: `scaleX(${Math.min(100, Math.max(0, pct)) / 100})`, background: bar ? undefined : "var(--skin-primary, #6c5ce7)" }}
   />
   ```

5. `src/components/dashboard/sections/StayMixSection.tsx:25` — replace:
   ```tsx
   <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
   ```
   with:
   ```tsx
   <div className="h-full w-full origin-left rounded-full transition-transform duration-300" style={{ transform: `scaleX(${pct / 100})`, background: meta.color }} />
   ```

6. `src/components/dashboard/sections/EarningsSection.tsx:301-302` —
   replace:
   ```tsx
   <div
     className={cn("w-full max-w-[36px] rounded-t-md transition-all group-hover:brightness-110", b.amount > 0 ? "dash-gradient-bar" : "bg-[var(--bg-2)]")}
     style={{ height: `${Math.max(4, Math.round((b.amount / max) * 80))}px` }}
   />
   ```
   with:
   ```tsx
   <div
     className={cn("w-full max-w-[36px] origin-bottom rounded-t-md transition-transform duration-300 group-hover:brightness-110", b.amount > 0 ? "dash-gradient-bar" : "bg-[var(--bg-2)]")}
     style={{ height: "80px", transform: `scaleY(${Math.max(4, Math.round((b.amount / max) * 80)) / 80})` }}
   />
   ```
   Note: the parent container that lays out these bars must already
   reserve 80px of height for them (the old code's max possible `height`
   was already capped near 80px via `(b.amount/max)*80`, so this doesn't
   change the column's footprint) — verify the immediate parent isn't
   itself sized by this child's height before assuming it's safe; if it
   is (e.g. a flex column measuring its tallest child), STOP and report
   rather than guessing a layout fix.

7. `src/components/ui/Toast.tsx:24` — replace:
   ```tsx
   "fixed left-1/2 bottom-6 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-bold text-white shadow-card transition-all duration-200",
   ```
   with:
   ```tsx
   "fixed left-1/2 bottom-6 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-bold text-white shadow-card transition-[transform,opacity] duration-200",
   ```

## Boundaries

- Do NOT touch `src/components/guest/FeedbackFormView.tsx:103`,
  `src/components/guest/UnsplashImage.tsx:62`,
  `src/components/guest/PlaceInsightRow.tsx:84`,
  `src/components/guest/GuidebookSections.tsx:270`, or
  `src/components/guest/GuideHubView.tsx:87` — these `transition-all`
  sites are hover/one-off-form-progress cases, lower severity, and
  explicitly out of scope for this plan (not selected in the audit
  triage) — do not "fix while you're in the area."
- Do NOT change `src/components/bookings/MotivationBanner.tsx:159-161`'s
  Framer Motion `width` animation — that's a different mechanism (JS/WAAPI
  via framer-motion, not a CSS transition) and is a separate, unselected
  finding.
- Do NOT change any bar's color logic, gradient, or the surrounding
  layout/spacing — only the width/height-vs-transform mechanism and the
  `transition-all` → scoped property list.
- If any cited file:line doesn't match the quoted current code (drift
  since the commit stamp), STOP and report instead of guessing.

## Verification

- **Mechanical**: `npx tsc --noEmit` and `npm run build` — both expect
  success.
- **Feel check**:
  1. Run `npm run dev`.
  2. Housekeeping: start a cleaning timer, confirm the progress bar still
     fills smoothly as time passes (visually identical to before — same
     fill percentage, same color, just driven by `scaleX` now).
  3. Bookings: view the Revenue Goal / Opportunity panel, confirm the fill
     bar still shows the correct percentage and eases in on load.
  4. Dashboard: view Stay Mix and Earnings sections, confirm the
     percentage bars and bar-chart columns render at the correct
     proportional size, with the Earnings bars still growing from the
     bottom (not top-anchored or upside down — this is the one most
     likely to visually regress if `origin-bottom` is wrong).
  5. Trigger a toast (any save action) — confirm it still slides up and
     fades in exactly as before.
  6. Open Chrome DevTools → Performance panel, record while a progress
     bar animates (e.g. reload Dashboard) — confirm the animated frames
     show only "Composite" work for these elements, not "Layout"/"Paint"
     (search the flame chart for the bar's element).
- **Done when**: every listed bar/bar-chart element visually renders
  identically to before (same fill %, same color, same growth direction)
  but is driven by `transform: scaleX/scaleY` instead of `width`/`height`,
  and Toast's transition no longer says `all`.
