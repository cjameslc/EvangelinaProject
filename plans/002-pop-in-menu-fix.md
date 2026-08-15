# 002 — Replace the bouncy pop-in menu animation with a fast, trigger-anchored fade

- **Status**: TODO
- **Commit**: 102fa08
- **Severity**: HIGH
- **Category**: Easing/duration + Physicality + Cohesion
- **Estimated scope**: 4 files (~20 lines)

## Problem

```ts
// tailwind.config.ts:46,76 — current
"pop-in": { "0%": { opacity: "0", transform: "scale(0.6) rotate(-6deg)" }, "60%": { opacity: "1", transform: "scale(1.08) rotate(2deg)" }, "100%": { transform: "scale(1) rotate(0deg)" } },
// ...
"pop-in": "pop-in .5s cubic-bezier(.34,1.56,.64,1) forwards",
```

Used on three high-frequency navigation dropdowns, opened many times per
day:
- `src/components/layout/Navbar.tsx:226` — the "More" nav menu:
  `<div role="menu" className="absolute left-0 top-[42px] w-64 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">`
- `src/components/layout/Navbar.tsx:328` — the account menu:
  `<div role="menu" className="absolute right-0 top-[46px] w-52 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">`
- `src/components/layout/StaycationSwitcher.tsx:96` — the property switcher:
  `<div role="menu" className="absolute right-0 top-[42px] w-64 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-pop-in">`

500ms is 2-3x the dropdown budget (150-250ms per AUDIT.md §2). The 0.6
initial scale is well below the 0.9-0.97 target (§3 — "never appear from
nothing"). The rotate+overshoot reads as celebratory on routine navigation
(§1 — tens-of-times/day elements should be fast/minimal, not delightful).
None of the three set a trigger-relative `transform-origin`, so they scale
from center instead of their trigger corner (§3).

## Target

```ts
/* target — tailwind.config.ts, replace the pop-in keyframe/animation */
"menu-in": { "0%": { opacity: "0", transform: "scale(0.95)" }, "100%": { opacity: "1", transform: "scale(1)" } },
// ...
"menu-in": "menu-in .18s cubic-bezier(0.23, 1, 0.32, 1) forwards",
```

180ms sits in the dropdown budget (150-250ms). Scale starts at 0.95 (inside
0.9-0.97). No rotation, no overshoot — a crisp fade+scale matching the
rest of the app's non-bouncy personality. `cubic-bezier(0.23, 1, 0.32, 1)`
is AUDIT.md's own named strong ease-out curve for entrances.

## Repo conventions to follow

- Keyframes/animation entries live in `tailwind.config.ts`'s
  `theme.extend.keyframes`/`theme.extend.animation` objects (see the
  existing `pop-in`/`toast-in`/`fade-up` entries for the exact object
  shape to match).
- `transform-origin` utilities in Tailwind are `origin-top-left`,
  `origin-top-right`, etc. — no custom CSS needed.

## Steps

1. In `tailwind.config.ts`, replace the `"pop-in"` keyframe entry (line 46)
   with:
   ```ts
   "menu-in": { "0%": { opacity: "0", transform: "scale(0.95)" }, "100%": { opacity: "1", transform: "scale(1)" } },
   ```
2. Replace the `"pop-in"` animation entry (line 76) with:
   ```ts
   "menu-in": "menu-in .18s cubic-bezier(0.23, 1, 0.32, 1) forwards",
   ```
   Do NOT remove or rename any other keyframe/animation in these objects.
3. In `src/components/layout/Navbar.tsx:226`, replace `animate-pop-in` with
   `animate-menu-in origin-top-left` (this menu is `absolute left-0`, so
   it's anchored top-left relative to its trigger).
4. In `src/components/layout/Navbar.tsx:328`, replace `animate-pop-in`
   with `animate-menu-in origin-top-right` (this menu is `absolute
   right-0`, anchored top-right).
5. In `src/components/layout/StaycationSwitcher.tsx:96`, replace
   `animate-pop-in` with `animate-menu-in origin-top-right` (also
   `absolute right-0`).
6. Search for any other `animate-pop-in` usage NOT covered by plan 007
   (which handles the two non-menu list-entrance sites,
   `RevenueGoalsPanel.tsx:126` and `EarningsView.tsx:608`) —
   `grep -rn "animate-pop-in" src/` — if any exist beyond the 5 total
   sites this audit found (3 here + 2 in plan 007), STOP and report
   instead of guessing whether they're a menu (this plan) or a list
   entrance (plan 007).

## Boundaries

- Do NOT change `RevenueGoalsPanel.tsx:126` or `EarningsView.tsx:608` —
  those are list-entrance sites, covered by plan 007, which handles them
  with a stagger rather than an origin (they're not trigger-anchored
  popovers).
- Do NOT remove the `"pop-in"` name entirely if any other file references
  it by that literal class name beyond the 3 sites listed — verify via
  the grep in step 6 first.
- Do NOT change the menus' `absolute left-0`/`right-0`/`top-*` positioning
  — only their animation class and the new `origin-*` addition.

## Verification

- **Mechanical**: `npx tsc --noEmit` and `npm run build` — both expect
  success. Also run `grep -rn "animate-pop-in" src/` after the edit and
  confirm zero results outside plan 007's two sites.
- **Feel check**:
  1. Run `npm run dev`, open the top nav.
  2. Click "More" — confirm the menu fades+scales in quickly (~180ms),
     growing from its top-left corner (near the trigger), with no
     rotation or bounce-overshoot.
  3. Click the account avatar menu — confirm it grows from its top-right
     corner.
  4. Open the property switcher (if you have 2+ staycations) — same
     top-right-anchored fade+scale.
  5. Rapidly click a trigger open/closed several times — confirm no
     visual glitching (menus mount/unmount cleanly; this reuses the
     existing conditional-render pattern, unchanged by this plan).
- **Done when**: all three menus open with a fast (~180ms), non-bouncy,
  trigger-anchored fade+scale, and `animate-pop-in` no longer appears
  anywhere these three components render.
