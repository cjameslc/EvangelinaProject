# 001 — Scope the global reduced-motion rule to movement, not everything

- **Status**: TODO
- **Commit**: 102fa08
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~15 lines

## Problem

```css
/* src/app/globals.css:345-358 — current */
/* App-wide reduced-motion safeguard — celebrate()'s confetti (any skin)
   and the marquee/ken-burns/sheen/dust ambient-motion keyframes all still
   render their DOM, just without moving, for anyone who's asked their OS
   not to animate things. Duration 0.01ms rather than "none" so a
   forwards-filled animation (confetti-fall) still lands on its end frame
   instead of snapping back to its 0% state. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The universal `transition-duration: 0.01ms !important` doesn't distinguish
movement from color/opacity/shadow. It flattens every `transition` in the
app to an instant snap, including ones that should stay per AUDIT.md
category 6 ("keep transitions that aid comprehension, remove position
changes"): body's background/color fade (`globals.css:342`), `.card`'s
shadow transition (`globals.css:399`), field-input focus rings
(`globals.css:402`), `.btn`/`.pill` hover states (`globals.css:363,423`),
and `.dashboard-metrics .stat-card`'s hover shadow (`globals.css:314`).
The `animation-duration: 0.01ms` half of the rule is correctly scoped
(keyframe-driven decorative motion like confetti/marquee/ken-burns/sheen/
dust genuinely should stop) — only the `transition-duration` line is too
broad.

## Target

Split the rule: keep the existing `animation-duration`/
`animation-iteration-count` override universal (keyframes are decorative
motion, correctly killed everywhere), but only force
`transition-duration: 0.01ms` on elements that actually move — identified
by a new opt-in class, not applied universally. Movement-only transition
utilities already used in this codebase (`transition-transform`,
`hover:-translate-y-*`, `hover:scale-*`) get tagged; color/shadow-only
transitions are left alone and keep their normal (already short, 150-300ms)
duration under reduced motion:

```css
/* target */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
  .motion-safe-transform,
  .motion-safe-transform * {
    transition-duration: 0.01ms !important;
  }
}
```

`.motion-safe-transform` is a new marker class this plan adds to the
specific elements whose *transition* includes a transform/movement
component — see Steps. Elements that only transition color/shadow/opacity
never get this class, so they keep animating (gently, per category 6),
while elements that move are still fully stilled.

## Repo conventions to follow

- This repo already uses small marker classes for CSS-only behavior gates
  — see `.dashboard-metrics` scoping `.stat-card:hover` (`globals.css:316-321`,
  its own comment explains the scoping-by-ancestor-class pattern). Follow
  that same "a class exists purely to scope a CSS rule" convention.
- Tailwind `@apply` blocks for shared component classes (`.btn`, `.card`,
  `.pill`, `.tag`) live in the same `globals.css` file, in a block starting
  around line 360 — this plan's new class stays in that same file, just
  outside the `@apply` block since it has no Tailwind utility equivalent.

## Steps

1. In `src/app/globals.css`, replace the block at lines 345-358 with:
   ```css
   /* App-wide reduced-motion safeguard — celebrate()'s confetti (any skin)
      and the marquee/ken-burns/sheen/dust ambient-motion keyframes all still
      render their DOM, just without moving, for anyone who's asked their OS
      not to animate things. Duration 0.01ms rather than "none" so a
      forwards-filled animation (confetti-fall) still lands on its end frame
      instead of snapping back to its 0% state.

      Transitions are handled separately from animations: only elements
      carrying .motion-safe-transform (added to specific transform/movement
      transitions below) get their transition-duration flattened too — a
      color or shadow transition (body background, .card shadow, focus
      rings, .btn/.pill hover) is exactly the kind of "aids comprehension"
      feedback AUDIT.md category 6 says reduced motion should keep, not
      remove. */
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       scroll-behavior: auto !important;
     }
     .motion-safe-transform,
     .motion-safe-transform * {
       transition-duration: 0.01ms !important;
     }
   }
   ```

2. Add `motion-safe-transform` to every hover-transform site the recon
   pass identified (these are the sites where the *transition* includes a
   transform, not just color):
   - `src/app/globals.css:381` — `.btn-primary` — add `motion-safe-transform`
     to its `@apply` list (it has `hover:-translate-y-px`).
   - `src/app/globals.css:319` — `.dashboard-metrics .stat-card` — this is
     a bare CSS rule (not `@apply`), so add the class in HTML instead: find
     its render site and add `motion-safe-transform` to the className
     (search `className.*stat-card` under `src/components/`).
   - `src/app/guide/nearby/[category]/page.tsx:37` — add
     `motion-safe-transform` alongside the existing `hover:-translate-y-0.5`
     class.
   - `src/components/earnings/EarningsView.tsx:608` — same, alongside
     `hover:-translate-y-0.5`.
   - `src/components/guest/PlaceInsightRow.tsx:84,94` — same, alongside
     `hover:-translate-y-0.5` / `group-hover:scale-105`.
   - `src/components/guest/GalleryLightbox.tsx:52` — same, alongside
     `hover:scale-105`.
   - `src/components/guest/ListingsGrid.tsx:426` — same, alongside
     `group-hover:scale-110`.
   - `src/components/guest/GuideHubView.tsx:87,94,100,110` — same, all 4
     `hover:-translate-y-1` / `group-hover:scale-110` sites.
   - `src/components/guest/BookingUnlockCard.tsx:53`,
     `src/components/guest/GuidebookSections.tsx:69,246,273` — same,
     alongside their `hover:-translate-y-0.5` classes.

   For every site: add the literal string `motion-safe-transform` into the
   existing `className`/`@apply` list, do not change any other class.

## Boundaries

- Do NOT remove or shorten any color/shadow/opacity transition's normal
  duration — those stay exactly as they are under reduced motion.
- Do NOT touch the `animation-duration`/`animation-iteration-count`/
  `scroll-behavior` lines — they were already correctly scoped universally.
- Do NOT add `motion-safe-transform` to any element whose transition is
  color/shadow-only (e.g. `.card`, `.field-input:focus`, `.pill` itself
  minus its hover-translate if it has none) — only elements with an actual
  transform/movement component in their transition.
- If any cited file:line's surrounding code doesn't match what's quoted
  here (drift since the commit stamp), STOP and report instead of
  guessing which class list to edit.

## Verification

- **Mechanical**: `npx tsc --noEmit` (expect zero errors — CSS + className
  changes only) and `npm run build` (expect success).
- **Feel check**:
  1. Run `npm run dev`. In Chrome DevTools → Rendering panel, enable
     "Emulate CSS media feature prefers-reduced-motion: reduce".
  2. Navigate to a page with `.card` (e.g. Bookings) and hover a card —
     confirm the shadow still transitions smoothly (not an instant snap).
  3. Focus a text input (e.g. any form field) — confirm the focus ring
     still eases in.
  4. Hover a button/card that has `hover:-translate-y-*` or
     `hover:scale-*` (e.g. a Guide Hub tile) — confirm the LIFT/SCALE is
     now instant (no movement), while its shadow/color (if any) still
     transitions.
  5. Toggle reduced-motion off, repeat steps 2-4 — confirm everything
     animates exactly as before this plan (no regression for users who
     haven't requested reduced motion).
- **Done when**: under `prefers-reduced-motion: reduce`, transform-based
  hover/press motion is instant everywhere listed in Steps, while color/
  shadow/opacity transitions elsewhere in the app continue to animate at
  their normal duration.
