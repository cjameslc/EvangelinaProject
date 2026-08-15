# 003 — Stop MotivationBanner's ambient loops after a few cycles

- **Status**: TODO
- **Commit**: 102fa08
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (~10 lines)

## Problem

`src/components/bookings/MotivationBanner.tsx` sits at the top of the
Bookings tab, a page staff revisit dozens of times a day (per the
component's own doc comment, it's always rendered there). While
`state === "partial"` — true most of a working day, whenever the property
isn't 100% booked — two motions loop **forever**, not gated by
`prefersReduced` in a way that matters here since the concern is
frequency, not accessibility:

```tsx
// src/components/bookings/MotivationBanner.tsx:100-109 — current
animate={{
  opacity: 1, y: 0,
  scale: prefersReduced ? 1 : [1, 1.006, 1],
}}
...
transition={{
  opacity: { duration: 0.35, ease: "easeOut" },
  y: { duration: 0.35, ease: "easeOut" },
  scale: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
}}
```

```tsx
// src/components/bookings/MotivationBanner.tsx:121-126 — current
{state === "partial" && !prefersReduced && (
  <>
    <SparkleIcon className="pointer-events-none absolute right-20 top-4 h-3 w-3 animate-float text-rausch/40" />
    <SparkleIcon className="pointer-events-none absolute right-10 top-8 h-2.5 w-2.5 animate-float text-rausch/30" style={{ animationDelay: "0.8s" }} />
  </>
)}
```

(`state === "full"` has the same `animate-float` sparkle pattern at line
119, one sparkle, same issue.) `animate-float` resolves to
`float 2.4s ease-in-out infinite` (`tailwind.config.ts:79`) — a Tailwind
utility shared elsewhere in the app, so its definition itself must not
change (see Boundaries). Per AUDIT.md §1: "tens of times/day" elements
should be removed or drastically reduced — a card seen dozens of times a
day should not breathe and sparkle indefinitely the whole time it's on
screen.

## Target

Cap both animations to a handful of cycles on mount, then let them settle
— keeps the "alive" feel on first paint without running all day:

```tsx
/* target */
transition={{
  opacity: { duration: 0.35, ease: "easeOut" },
  y: { duration: 0.35, ease: "easeOut" },
  scale: { duration: 4.5, repeat: prefersReduced ? 0 : 2, ease: "easeInOut" },
}}
```

```tsx
/* target — sparkle style prop gets an iteration cap alongside its
   existing animationDelay override */
<SparkleIcon className="pointer-events-none absolute right-16 top-3 h-4 w-4 animate-float text-green/50" style={{ animationDelay: "0.3s", animationIterationCount: 3 }} />
```

`repeat: 2` on the 4.5s scale breath ≈ 13.5s of gentle motion on mount,
then it settles at `scale: 1` (framer-motion holds the animate value's
last keyframe after repeats exhaust — no extra step needed). 3 iterations
of the 2.4s float ≈ 7.2s, same idea. Neither loops for the rest of the
time the card is mounted.

## Repo conventions to follow

- Inline `style={{ animationDelay: ... }}` overrides on `animate-float`
  sparkles already exist in this exact file (line 119, 124) — add
  `animationIterationCount` into that same style object, don't introduce
  a new mechanism.
- `useReducedMotion()` from `framer-motion` is already imported and used
  in this file (line 4, 32, 71) — the `scale` transition's existing
  `prefersReduced ? 1 : [...]` ternary (line 102) is the pattern to
  extend, not replace.

## Steps

1. In `src/components/bookings/MotivationBanner.tsx`, update the `scale`
   transition (around line 108):
   ```tsx
   // before
   scale: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
   // after
   scale: { duration: 4.5, repeat: prefersReduced ? 0 : 2, ease: "easeInOut" },
   ```
2. On the "full" state's sparkle (line 119), add `animationIterationCount`
   to its existing style object:
   ```tsx
   // before
   <SparkleIcon className="pointer-events-none absolute right-16 top-3 h-4 w-4 animate-float text-green/50" style={{ animationDelay: "0.3s" }} />
   // after
   <SparkleIcon className="pointer-events-none absolute right-16 top-3 h-4 w-4 animate-float text-green/50" style={{ animationDelay: "0.3s", animationIterationCount: 3 }} />
   ```
3. On the "partial" state's two sparkles (lines 123-124), add the same
   property (the first has no existing style prop, add one; the second
   already has one for `animationDelay`):
   ```tsx
   // before
   <SparkleIcon className="pointer-events-none absolute right-20 top-4 h-3 w-3 animate-float text-rausch/40" />
   <SparkleIcon className="pointer-events-none absolute right-10 top-8 h-2.5 w-2.5 animate-float text-rausch/30" style={{ animationDelay: "0.8s" }} />
   // after
   <SparkleIcon className="pointer-events-none absolute right-20 top-4 h-3 w-3 animate-float text-rausch/40" style={{ animationIterationCount: 3 }} />
   <SparkleIcon className="pointer-events-none absolute right-10 top-8 h-2.5 w-2.5 animate-float text-rausch/30" style={{ animationDelay: "0.8s", animationIterationCount: 3 }} />
   ```

## Boundaries

- Do NOT change `tailwind.config.ts`'s `float` keyframe/animation
  definition — `animate-float` is used elsewhere in the app and must stay
  infinite by default; this plan overrides iteration count per-instance
  via inline style only, in this one file.
- Do NOT change the `useCountUp` counter, the confetti-on-"full" logic
  (lines 78-89), or the one-shot `opacity`/`y` entrance/exit transition
  values — those are correct as-is (see plan 007 for the separate
  reduced-motion gap on the y-slide, not touched here).
- Do NOT change the `empty` state's radial-gradient decoration (line
  127-129) — it's static, not animated, not in scope.
- If the quoted line numbers/code don't match what you find (drift since
  the commit stamp), STOP and report instead of guessing.

## Verification

- **Mechanical**: `npx tsc --noEmit` and `npm run build` — both expect
  success (`animationIterationCount` is a valid React `CSSProperties` key,
  no type error expected).
- **Feel check**:
  1. Run `npm run dev`, open Bookings with the unit occupancy in a
     "partial" state (some but not all units booked today).
  2. Watch the banner for at least 20 seconds without navigating away —
     confirm the card's breathing scale pulse and the two sparkles all
     stop moving after their first few cycles (roughly 7-14s), settling
     into a static (but still colored/gradiented) card.
  3. Reload the page — confirm the loops restart fresh on the new mount
     (this is expected: the cap is per-mount, not per-session) and again
     settle after a few cycles.
  4. Repeat with the property fully booked ("full" state) — same check on
     its single sparkle.
  5. In DevTools Rendering panel, enable
     `prefers-reduced-motion: reduce`: confirm the scale pulse doesn't
     run at all (already gated, unchanged by this plan) — this step is a
     regression check, not new behavior.
- **Done when**: the banner's ambient motion (breathing scale + sparkles)
  plays a handful of times on mount and then holds still, in both
  "partial" and "full" states, without needing reduced-motion to be
  enabled.
