// Personal UI color themes — a per-account preference (User.colorTheme),
// deliberately separate from the business-wide Seasonal Skin System
// (src/lib/skins/), which is one Admin-controlled setting every visitor of
// a tenant sees identically. This is the opposite: each staff member picks
// their own, and it only ever affects their own screen.
//
// This file is the single source of truth for each theme's actual colors
// (used by the Theme Selector's preview cards). The CSS side
// ([data-color-theme="..."] blocks in globals.css) must be kept in sync by
// hand — the same manually-synced-pair convention this codebase already
// uses for the Seasonal Skin System (src/lib/skins/config.ts's `colors`
// vs. globals.css's `[data-skin="..."]` blocks), not a new pattern.
export type ColorThemeId =
  | "midnightChampagne"
  | "charcoalGold"
  | "deepNavyIvory"
  | "forestChampagne"
  | "warmBlackRose"
  | "slateSand"
  | "royalViolet"
  | "airbnbInspired";

export type ColorThemeColors = {
  background: string;
  surface: string;
  primary: string;
  primaryHover: string;
  /** The label color .btn-primary and similar solid-primary-fill controls
   * actually render — NOT always white. Several of these themes lean into
   * a pale/champagne/ivory primary by design, and white text on a pale
   * gold button is close to unreadable (measured as low as 1.41:1 WCAG
   * contrast for Forest Champagne) — the app-wide button previously
   * hardcoded `text-white` regardless of theme, an accessibility bug this
   * field fixes. Each value below is the higher-contrast option between
   * white and the theme's own dark `background`, verified ≥4.5:1 (WCAG AA
   * normal text) against `primary` — except airbnbInspired, which keeps
   * white to match Airbnb's own real production brand button (their red
   * doesn't hit 4.5:1 with white either; changing it would look off-brand
   * for a theme whose entire point is matching that real palette).
   */
  buttonText: string;
  text: string;
  mutedText: string;
  border: string;
  success: string;
  warning: string;
  error: string;
};

export type ColorThemeConfig = {
  id: ColorThemeId;
  name: string;
  tagline: string;
  colors: ColorThemeColors;
};

export const DEFAULT_COLOR_THEME: ColorThemeId = "midnightChampagne";

export const COLOR_THEMES: Record<ColorThemeId, ColorThemeConfig> = {
  midnightChampagne: {
    id: "midnightChampagne",
    name: "Midnight Champagne",
    tagline: "Luxury hotel + premium SaaS",
    colors: {
      background: "#0F172A", surface: "#172033", primary: "#D4AF72", primaryHover: "#E2C48A", buttonText: "#0F172A",
      text: "#F8F5EF", mutedText: "#A8B0BD", border: "#2A3445",
      success: "#4ADE80", warning: "#FBBF24", error: "#F87171",
    },
  },
  charcoalGold: {
    id: "charcoalGold",
    name: "Charcoal Gold",
    tagline: "Elegant, sophisticated, high-end",
    colors: {
      background: "#18181B", surface: "#242428", primary: "#C9A227", primaryHover: "#DDBA45", buttonText: "#18181B",
      text: "#FAFAF9", mutedText: "#A1A1AA", border: "#3F3F46",
      success: "#4ADE80", warning: "#FACC15", error: "#F87171",
    },
  },
  deepNavyIvory: {
    id: "deepNavyIvory",
    name: "Deep Navy Ivory",
    tagline: "Luxury hotel/resort",
    colors: {
      background: "#0B1F33", surface: "#132C43", primary: "#C6A15B", primaryHover: "#D9BA7A", buttonText: "#0B1F33",
      text: "#F5F1E8", mutedText: "#AAB7C4", border: "#294158",
      success: "#4ADE80", warning: "#FBBF24", error: "#FB7185",
    },
  },
  forestChampagne: {
    id: "forestChampagne",
    name: "Forest Champagne",
    tagline: "Natural, calm, resort-inspired",
    colors: {
      background: "#12372A", surface: "#1A4637", primary: "#E8D8B0", primaryHover: "#F0E3C2", buttonText: "#12372A",
      text: "#FAF9F4", mutedText: "#B8C7BE", border: "#315746",
      success: "#86EFAC", warning: "#FDE68A", error: "#FDA4AF",
    },
  },
  warmBlackRose: {
    id: "warmBlackRose",
    name: "Warm Black Rose",
    tagline: "Boutique, stylish and contemporary",
    colors: {
      background: "#171414", surface: "#241E20", primary: "#B76E79", primaryHover: "#CC8792", buttonText: "#171414",
      text: "#F7F0EA", mutedText: "#B9AFB0", border: "#403638",
      success: "#86EFAC", warning: "#FCD34D", error: "#FB7185",
    },
  },
  slateSand: {
    id: "slateSand",
    name: "Slate Sand",
    tagline: "Minimal, warm and professional",
    colors: {
      background: "#263238", surface: "#34444A", primary: "#D8C3A5", primaryHover: "#E5D2B8", buttonText: "#263238",
      text: "#F5F1EA", mutedText: "#B8C0C3", border: "#4A5A60",
      success: "#86EFAC", warning: "#FCD34D", error: "#FB7185",
    },
  },
  // Deep jewel-toned purple, in the same "luxury hotel / premium SaaS"
  // family as the six above rather than a generic lavender — regal, not
  // pastel. Primary is violet-600 (#7C3AED) rather than the lighter
  // violet-500 — deliberately chosen so white button text clears WCAG AA
  // (5.70:1) instead of landing in the same illegible territory the six
  // pale-primary themes above needed buttonText to fix.
  royalViolet: {
    id: "royalViolet",
    name: "Royal Violet",
    tagline: "Regal, rich, and refined",
    colors: {
      background: "#1A0F2E", surface: "#241640", primary: "#7C3AED", primaryHover: "#8B5CF6", buttonText: "#FFFFFF",
      text: "#F5F0FF", mutedText: "#B8A9D9", border: "#3D2A5E",
      success: "#86EFAC", warning: "#FCD34D", error: "#FB7185",
    },
  },
  // The one light theme in this set (all six above, plus Royal Violet, are
  // deliberately dark/moody luxury palettes) — real Airbnb brand colors
  // (Rausch red, Hof near-black text, Babu teal, Arches orange), not an
  // approximation, since "inspired by" a specific real brand only reads as
  // genuine if the actual hexes match.
  airbnbInspired: {
    id: "airbnbInspired",
    name: "Airbnb Inspired",
    tagline: "Clean, bright, and familiar",
    colors: {
      background: "#FFFFFF", surface: "#F7F7F7", primary: "#FF385C", primaryHover: "#E31C5F", buttonText: "#FFFFFF",
      text: "#222222", mutedText: "#717171", border: "#DDDDDD",
      success: "#00A699", warning: "#FC642D", error: "#C13515",
    },
  },
};

export const COLOR_THEME_LIST = Object.values(COLOR_THEMES);

export function isColorThemeId(value: string | null | undefined): value is ColorThemeId {
  return !!value && value in COLOR_THEMES;
}
