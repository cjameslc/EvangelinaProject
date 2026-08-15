// Seasonal Skin System — shared types. See config.ts for the actual skin
// registry and resolveActiveSkinId.ts for how one skin gets chosen as
// "active" at any given moment. Nothing in this file (or anywhere in
// src/lib/skins/) may import from booking/payment/availability logic —
// the skin layer only ever describes *presentation*, never business rules
// (see the module doc comment in resolveActiveSkinId.ts).

export type SkinId =
  | "evangelina"
  | "christmas"
  | "newYear"
  | "valentines"
  | "chineseNewYear"
  | "spring"
  | "independence"
  | "halloween"
  | "summer"
  | "anniversary"
  | "airbnb";

/** Recurring yearly month/day window (no year component) — e.g. Christmas
 * is Dec 1 -> Dec 30 every year, not a one-time date. `null` means this
 * skin never activates automatically; it's manual-only (e.g. Anniversary,
 * whose real date isn't modeled here, or a one-off promotion). Wraps
 * across the year boundary fine (e.g. New Year's Dec 31 -> Jan 2) — see
 * resolveActiveSkinId's isWithinSchedule. */
export type SkinSchedule = { startMonth: number; startDay: number; endMonth: number; endDay: number } | null;

export type SkinColors = {
  /** The skin's dominant brand hue — hero backgrounds, primary CTAs on skinned surfaces, active nav accents within skinned components. */
  primary: string;
  /** Secondary/complementary hue — usually the skin's "premium accent" (often gold). */
  secondary: string;
  /** Third accent for small details (badges, icons, highlights) — sometimes equal to secondary for a simpler 2-tone skin. */
  accent: string;
  /** Gradient stops for hero/banner surfaces — CSS color strings (hex or rgba), used as `linear-gradient(..., surfaceFrom, surfaceTo)`. */
  surfaceFrom: string;
  surfaceTo: string;
  /** rgba() string for a soft box-shadow glow behind hero art/badges. */
  glow: string;
};

export type SkinMessaging = {
  /** Small eyebrow label above a hero headline, e.g. "🎄 CHRISTMAS SEASON". */
  marketingEyebrow: string;
  marketingHeadline: string;
  marketingSubtext: string;
  marketingCta: string;
  /** Short phrase substituted into "{label} Stay" on booking surfaces — "" for the default skin (plain "Book Your Stay", no seasonal prefix). */
  bookingLabel: string;
  bookerChallengeTitle: string;
  /** Booker challenge card's static subtitle line (the live "{n} more to reach your goal" line is computed from real data, not stored here). */
  bookerChallengeSub: string;
  housekeepingTitle: string;
  bookingSuccessMessage: string;
  feedbackSuccessMessage: string;
};

export type SkinConfig = {
  id: SkinId;
  /** Display name, e.g. "Christmas". */
  name: string;
  /** "Evangelina {name}" identity line, e.g. "Evangelina Christmas" — matches the spec's "Final Vision" naming. */
  fullName: string;
  emoji: string;
  colors: SkinColors;
  messaging: SkinMessaging;
  /** Confetti particle colors for celebrate() — see src/lib/skins/celebrate.ts. */
  confettiColors: string[];
  /** Emoji set for SeasonalAmbience's floating/drifting decoration layer
   * (marketing hero, challenge cards) — one shared component reads this,
   * never a bespoke effect per skin. Empty array = no ambience for this
   * skin — true for evangelina (default, no-op) and airbnb (a deliberately
   * minimal/clean style where floating emoji would be off-brand). */
  decorationEmojis: string[];
  /** A real, licensed photo for the marketing page's "Seasonal Spotlight"
   * banner (src/components/skins/SeasonalSpotlight.tsx) — never a
   * fabricated or placeholder image. `null` for evangelina and airbnb,
   * neither of which use a spotlight banner. */
  spotlight: {
    imageUrl: string;
    imageAlt: string;
    /** "Photographer Name on Unsplash" — shown small, bottom-corner. */
    credit: string;
    /** Distinct from messaging.marketingSubtext — this is the banner's own line, not a repeat of the hero copy. */
    message: string;
  } | null;
  schedule: SkinSchedule;
};
