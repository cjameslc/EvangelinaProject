import type { SkinConfig, SkinId } from "./types";

// The centralized skin registry — every skin the platform can wear. Adding
// a new one is *only* ever adding an entry here (colors/messaging/schedule)
// plus, if it needs one, a confetti palette — never a per-page branch.
// Section 11 of the brief asks for admin-created custom skins eventually;
// this array is deliberately the one seam that would move (e.g. to a DB
// table) to support that without touching anything that reads SKINS.
//
// Real image/illustration assets are intentionally not part of this v1 —
// every skin's "world" is built from color + gradient + emoji + copy
// (matching the brief's own explicit "do not copy Clash of Clans
// graphics" and "keep it tasteful" guidance), consumed by the shared
// components in src/components/skins/. A later asset system (backgrounds,
// hero art, decorations per skin) would add fields here, not new pages.
export const SKINS: Record<SkinId, SkinConfig> = {
  evangelina: {
    id: "evangelina",
    name: "Evangelina Violet",
    fullName: "Evangelina Violet",
    emoji: "💜",
    colors: {
      primary: "#6C5CE7",
      secondary: "#C9A24B",
      accent: "#C9A24B",
      surfaceFrom: "rgba(108,92,231,0.14)",
      surfaceTo: "rgba(201,162,75,0.08)",
      glow: "rgba(108,92,231,0.35)",
    },
    messaging: {
      // Matches the existing hardcoded /book hero copy exactly — the
      // default skin must be a visual no-op vs. what's already live today.
      marketingEyebrow: "Evangelina's Staycation",
      marketingHeadline: "Your Perfect Stay in the Heart of Cubao",
      marketingSubtext: "Five thoughtfully designed staycation units with fast WiFi, Netflix, and hotel-soft beds",
      marketingCta: "Check Availability",
      bookingLabel: "",
      bookerChallengeTitle: "Monthly Booking Goal",
      bookerChallengeSub: "Keep the momentum going.",
      housekeepingTitle: "Today's Turnover",
      bookingSuccessMessage: "🎉 Your booking is confirmed!",
      feedbackSuccessMessage: "🎉 Thank you for sharing your experience!",
    },
    confettiColors: ["#6C5CE7", "#A78BFA", "#C9A24B", "#8B7CF0"],
    decorationEmojis: [],
    spotlight: null, // default skin relies entirely on real unit photos, no seasonal banner
    schedule: null, // the permanent default — never date-matched, only ever the fallback
  },

  christmas: {
    id: "christmas",
    name: "Christmas",
    fullName: "Evangelina Christmas",
    emoji: "🎄",
    colors: {
      primary: "#14532D",
      secondary: "#B3243A",
      accent: "#C9A24B",
      surfaceFrom: "rgba(20,83,45,0.16)",
      surfaceTo: "rgba(179,36,58,0.10)",
      glow: "rgba(179,36,58,0.35)",
    },
    messaging: {
      marketingEyebrow: "🎄 CHRISTMAS SEASON",
      marketingHeadline: "Celebrate the Holidays at Evangelina's",
      marketingSubtext: "Make your holiday stay special — warm, festive, and comfortable.",
      marketingCta: "Book Your Holiday Stay",
      bookingLabel: "Holiday",
      bookerChallengeTitle: "🎄 Holiday Booking Rush",
      bookerChallengeSub: "Every booking helps make someone's holiday.",
      housekeepingTitle: "🎄 Holiday Room Prep",
      bookingSuccessMessage: "🎄 Your holiday stay is confirmed!",
      feedbackSuccessMessage: "🎄 Thank you for spending the holidays with us!",
    },
    confettiColors: ["#14532D", "#B3243A", "#C9A24B", "#F6EFE1"],
    decorationEmojis: ["❄️", "🎄", "✨", "🔔"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1766422646104-49661299db4b?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "A cozy living room decorated for Christmas with a lit tree and paper stars",
      credit: "Photo: Julia Blumberg on Unsplash",
      message: "Twinkling lights, cozy blankets, and the quiet magic of the season — right here at Evangelina's.",
    },
    schedule: { startMonth: 12, startDay: 1, endMonth: 12, endDay: 30 },
  },

  newYear: {
    id: "newYear",
    name: "New Year",
    fullName: "Evangelina New Year",
    emoji: "🎆",
    colors: {
      primary: "#3B1E7A",
      secondary: "#C9A24B",
      accent: "#F7E7CE",
      surfaceFrom: "rgba(11,19,48,0.55)",
      surfaceTo: "rgba(201,162,75,0.14)",
      glow: "rgba(201,162,75,0.4)",
    },
    messaging: {
      marketingEyebrow: "✨ NEW YEAR",
      marketingHeadline: "Start the Year With a Stay",
      marketingSubtext: "Ring in the new year somewhere comfortable.",
      marketingCta: "Book Your Stay",
      bookingLabel: "New Year",
      bookerChallengeTitle: "🎆 New Year Challenge",
      bookerChallengeSub: "Start strong.",
      housekeepingTitle: "✨ New Year Reset",
      bookingSuccessMessage: "🎆 Your booking is confirmed — happy new year!",
      feedbackSuccessMessage: "✨ Thank you — here's to a great year ahead!",
    },
    confettiColors: ["#C9A24B", "#F7E7CE", "#3B1E7A", "#FFFFFF"],
    decorationEmojis: ["🎆", "✨", "🥂", "🎇"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1719727033384-fe3982381d8c?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "Gold fireworks bursting over a night sky with a palm tree silhouette",
      credit: "Photo: Tim Mossholder on Unsplash",
      message: "Golden sparks against the night sky — the perfect send-off for the year, and a fresh start close to home.",
    },
    schedule: { startMonth: 12, startDay: 31, endMonth: 1, endDay: 2 },
  },

  valentines: {
    id: "valentines",
    name: "Valentine's",
    fullName: "Evangelina Valentine's",
    emoji: "💝",
    colors: {
      primary: "#6C5CE7",
      secondary: "#D6336C",
      accent: "#F8BBD0",
      surfaceFrom: "rgba(108,92,231,0.14)",
      surfaceTo: "rgba(214,51,108,0.10)",
      glow: "rgba(214,51,108,0.32)",
    },
    messaging: {
      marketingEyebrow: "💝 VALENTINE'S",
      marketingHeadline: "A Stay Made for Two",
      marketingSubtext: "Make this Valentine's unforgettable.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Valentine's",
      bookerChallengeTitle: "💝 Valentine's Booking Season",
      bookerChallengeSub: "You're helping create memorable stays.",
      housekeepingTitle: "✨ Romantic Stay Preparation",
      bookingSuccessMessage: "💝 Your Valentine's stay is confirmed!",
      feedbackSuccessMessage: "💝 Thank you for celebrating with us!",
    },
    confettiColors: ["#D6336C", "#6C5CE7", "#F8BBD0", "#F7E7CE"],
    decorationEmojis: ["💝", "💕", "🌹", "✨"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1676868198934-ef67ee2c808c?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "A bouquet of red roses and baby's breath",
      credit: "Photo: Raunaq Sachdev on Unsplash",
      message: "Petals, candlelight, and a little extra romance — because every stay can be a love story.",
    },
    schedule: { startMonth: 2, startDay: 1, endMonth: 2, endDay: 14 },
  },

  chineseNewYear: {
    id: "chineseNewYear",
    name: "Chinese New Year",
    fullName: "Evangelina Chinese New Year",
    emoji: "🧧",
    colors: {
      primary: "#C8102E",
      secondary: "#C9A24B",
      accent: "#6B0F1A",
      surfaceFrom: "rgba(200,16,46,0.16)",
      surfaceTo: "rgba(201,162,75,0.12)",
      glow: "rgba(201,162,75,0.38)",
    },
    messaging: {
      marketingEyebrow: "🧧 CHINESE NEW YEAR",
      marketingHeadline: "Welcome Good Fortune This New Year",
      marketingSubtext: "Start the lunar new year with a comfortable stay.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Lunar New Year",
      bookerChallengeTitle: "🧧 New Year Prosperity Season",
      bookerChallengeSub: "Every booking brings good fortune.",
      housekeepingTitle: "🧧 New Year Room Prep",
      bookingSuccessMessage: "🧧 Your booking is confirmed — happy new year!",
      feedbackSuccessMessage: "🧧 Thank you and happy new year!",
    },
    confettiColors: ["#C8102E", "#C9A24B", "#6B0F1A"],
    // Lunar New Year's real date shifts every year — this fixed window is
    // an approximation of its most common range; an admin should switch to
    // Manual override for the actual date most years rather than relying
    // on this alone.
    decorationEmojis: ["🧧", "🏮", "✨"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1735126419093-9cf5c85320a3?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "A street filled with rows of glowing red lanterns",
      credit: "Photo: Susan Q Yin on Unsplash",
      message: "A thousand red lanterns, a thousand wishes for prosperity — welcome the new year in comfort.",
    },
    schedule: { startMonth: 1, startDay: 21, endMonth: 2, endDay: 9 },
  },

  spring: {
    id: "spring",
    name: "Spring/Easter",
    fullName: "Evangelina Spring",
    emoji: "🌸",
    colors: {
      primary: "#6C5CE7",
      secondary: "#86C99A",
      accent: "#FBCFE8",
      surfaceFrom: "rgba(134,201,154,0.16)",
      surfaceTo: "rgba(251,207,232,0.14)",
      glow: "rgba(134,201,154,0.3)",
    },
    messaging: {
      marketingEyebrow: "🌸 SPRING SEASON",
      marketingHeadline: "A Fresh Start at Evangelina's",
      marketingSubtext: "Bright days, easy bookings.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Spring",
      bookerChallengeTitle: "🌸 Spring Booking Season",
      bookerChallengeSub: "Fresh season, fresh goals.",
      housekeepingTitle: "🌸 Spring Turnover",
      bookingSuccessMessage: "🌸 Your booking is confirmed!",
      feedbackSuccessMessage: "🌸 Thank you for staying with us!",
    },
    confettiColors: ["#86C99A", "#FBCFE8", "#6C5CE7", "#F7E7CE"],
    // Easter's real date shifts every year (same caveat as Chinese New
    // Year above) — this window covers its most common range.
    decorationEmojis: ["🌸", "🦋", "🌷", "✨"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1745106673075-d616222217b8?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "Pink cherry blossoms blooming against a blue sky",
      credit: "Photo: Ashe Walker on Unsplash",
      message: "Soft petals, longer days, and easy plans — spring is the season for saying yes to a getaway.",
    },
    schedule: { startMonth: 3, startDay: 15, endMonth: 4, endDay: 15 },
  },

  independence: {
    id: "independence",
    name: "Philippine Independence",
    fullName: "Evangelina Independence Day",
    emoji: "🇵🇭",
    colors: {
      primary: "#0038A8",
      secondary: "#CE1126",
      accent: "#FCD116",
      surfaceFrom: "rgba(0,56,168,0.14)",
      surfaceTo: "rgba(206,17,38,0.10)",
      glow: "rgba(252,209,22,0.35)",
    },
    messaging: {
      marketingEyebrow: "🇵🇭 INDEPENDENCE DAY",
      marketingHeadline: "Celebrate Kalayaan at Evangelina's",
      marketingSubtext: "Mabuhay! Book a stay this Independence Day.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Independence Day",
      bookerChallengeTitle: "🇵🇭 Kalayaan Booking Season",
      bookerChallengeSub: "Celebrate the season with every booking.",
      housekeepingTitle: "🇵🇭 Kalayaan Room Prep",
      bookingSuccessMessage: "🇵🇭 Your booking is confirmed — Mabuhay!",
      feedbackSuccessMessage: "🇵🇭 Maraming salamat po!",
    },
    confettiColors: ["#0038A8", "#CE1126", "#FCD116", "#FFFFFF"],
    decorationEmojis: ["🇵🇭", "⭐", "🎉"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1722503944406-c6a10d6d0be4?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "The Philippine flag waving against a clear blue sky",
      credit: "Photo: Shekinah Togonon on Unsplash",
      message: "Mabuhay! Celebrate Filipino pride and freedom with a stay that feels like home.",
    },
    schedule: { startMonth: 6, startDay: 1, endMonth: 6, endDay: 14 },
  },

  halloween: {
    id: "halloween",
    name: "Halloween",
    fullName: "Evangelina Halloween",
    emoji: "🎃",
    colors: {
      primary: "#2A1245",
      secondary: "#F97316",
      accent: "#C87D00",
      surfaceFrom: "rgba(42,18,69,0.6)",
      surfaceTo: "rgba(249,115,22,0.14)",
      glow: "rgba(249,115,22,0.35)",
    },
    messaging: {
      marketingEyebrow: "🎃 HALLOWEEN",
      marketingHeadline: "Something Special This Season",
      marketingSubtext: "A cozy stay for spooky season.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Halloween",
      bookerChallengeTitle: "🎃 Halloween Booking Season",
      bookerChallengeSub: "Keep the streak going.",
      housekeepingTitle: "🎃 Turnover Checklist",
      bookingSuccessMessage: "🎃 Your booking is confirmed!",
      feedbackSuccessMessage: "🎃 Thanks for staying with us!",
    },
    confettiColors: ["#F97316", "#2A1245", "#C87D00"],
    decorationEmojis: ["🎃", "👻", "🦇", "✨"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1659389138838-2d36616c6a61?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "A group of glowing carved jack-o-lanterns in the dark",
      credit: "Photo: Erica Marsland Huynh on Unsplash",
      message: "Flickering pumpkins and cozy nights in — spooky season never felt this comfortable.",
    },
    schedule: { startMonth: 10, startDay: 15, endMonth: 10, endDay: 31 },
  },

  summer: {
    id: "summer",
    name: "Summer",
    fullName: "Evangelina Summer Escape",
    emoji: "🌴",
    colors: {
      primary: "#6C5CE7",
      secondary: "#0EA5E9",
      accent: "#FBBF24",
      surfaceFrom: "rgba(14,165,233,0.14)",
      surfaceTo: "rgba(251,191,36,0.10)",
      glow: "rgba(14,165,233,0.3)",
    },
    messaging: {
      marketingEyebrow: "☀️ SUMMER ESCAPE",
      marketingHeadline: "Your Next Escape Starts Here",
      marketingSubtext: "Plan your perfect stay this summer.",
      marketingCta: "Book Your Escape",
      bookingLabel: "Summer",
      bookerChallengeTitle: "☀️ Summer Rush",
      bookerChallengeSub: "Keep the units booked this season.",
      housekeepingTitle: "🌴 Summer Turnover",
      bookingSuccessMessage: "☀️ Your summer stay is confirmed!",
      feedbackSuccessMessage: "🌴 Thanks for spending summer with us!",
    },
    confettiColors: ["#0EA5E9", "#FBBF24", "#6C5CE7", "#FFFFFF"],
    decorationEmojis: ["🌴", "☀️", "🌊", "🍹"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1760815153715-9fce4c3644a3?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "A tropical beach hammock strung between palm trees over clear water",
      credit: "Photo: Bernd Dittrich on Unsplash",
      message: "Palm trees, clear water, and slow afternoons — your escape is closer than you think.",
    },
    schedule: { startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
  },

  anniversary: {
    id: "anniversary",
    name: "Anniversary",
    fullName: "Evangelina Anniversary",
    emoji: "🎉",
    colors: {
      primary: "#6C5CE7",
      secondary: "#C9A24B",
      accent: "#F7E7CE",
      surfaceFrom: "rgba(108,92,231,0.18)",
      surfaceTo: "rgba(201,162,75,0.16)",
      glow: "rgba(201,162,75,0.4)",
    },
    messaging: {
      marketingEyebrow: "🎉 ANNIVERSARY",
      marketingHeadline: "Celebrating Evangelina's Staycation",
      marketingSubtext: "Another year of memorable stays — thank you for being part of it.",
      marketingCta: "Book Your Stay",
      bookingLabel: "Anniversary",
      bookerChallengeTitle: "🎉 Anniversary Season",
      bookerChallengeSub: "Help make this milestone one to remember.",
      housekeepingTitle: "🎉 Anniversary Room Prep",
      bookingSuccessMessage: "🎉 Your booking is confirmed — thank you for celebrating with us!",
      feedbackSuccessMessage: "🎉 Thank you for being part of our story!",
    },
    confettiColors: ["#6C5CE7", "#C9A24B", "#F7E7CE", "#A78BFA"],
    decorationEmojis: ["🎉", "🎊", "✨", "🥳"],
    spotlight: {
      imageUrl: "https://images.unsplash.com/photo-1698285439446-2ad560e31a17?auto=format&fit=crop&w=1600&q=80",
      imageAlt: "Gold balloons with confetti and ribbon on a light background",
      credit: "Photo: Shamblen Studios on Unsplash",
      message: "Gold confetti, one more year of memorable stays — thank you for being part of our story.",
    },
    // No fixed real-world anniversary date modeled here — this skin is
    // manual-only (Admin activates it directly for the occasion), matching
    // the brief's own "Useful for: ...Business anniversary" note under
    // Manual mode.
    schedule: null,
  },

  // Not a seasonal/event skin — a permanent alternate *style* option,
  // manual-only (like Anniversary), for admins who want the clean
  // white-card / coral-accent look common to modern travel marketplaces.
  // "Rausch" (this app's own existing --rausch: #FF385C brand token) is
  // reused as-is here rather than introducing a new red, since it's
  // already this app's own color, not something copied in for this skin.
  // Deliberately no floating decorations or stock-photo spotlight — a
  // clean/minimal style is the whole point, and public-facing copy never
  // names any third-party brand (this skin's name/fullName below are
  // shown only in the Admin picker, never on the guest-facing site).
  airbnb: {
    id: "airbnb",
    name: "Airbnb Style",
    fullName: "Evangelina — Airbnb Style",
    emoji: "🏡",
    colors: {
      primary: "#FF385C",
      // Deliberately white/near-white, not the near-black actually used
      // for Airbnb-style body text — colors.secondary/accent double as
      // CTA-gradient and on-photo-text colors elsewhere in the skin
      // system (ListingsGrid's hero CTA and eyebrow badge), both of which
      // assume a bright color here paired with dark button text. A dark
      // secondary made the CTA and eyebrow unreadable — caught visually,
      // not by any type/lint check.
      secondary: "#FFFFFF",
      accent: "#F5F5F5",
      surfaceFrom: "rgba(255,56,92,0.06)",
      surfaceTo: "rgba(34,34,34,0.04)",
      glow: "rgba(255,56,92,0.28)",
    },
    messaging: {
      marketingEyebrow: "SIMPLE & TRUSTED",
      marketingHeadline: "Book a Great Stay, Simply",
      marketingSubtext: "Clear pricing, real photos, easy booking — no surprises.",
      marketingCta: "Check Availability",
      bookingLabel: "",
      bookerChallengeTitle: "Booking Goal",
      bookerChallengeSub: "Stay ahead of your target.",
      housekeepingTitle: "Today's Turnover",
      bookingSuccessMessage: "Booking confirmed.",
      feedbackSuccessMessage: "Thanks for your feedback.",
    },
    confettiColors: ["#FF385C", "#222222", "#FFFFFF", "#767676"],
    decorationEmojis: [],
    spotlight: null,
    schedule: null,
  },
};

export const SKIN_LIST: SkinConfig[] = Object.values(SKINS);

export function getSkin(id: SkinId | string | null | undefined): SkinConfig {
  if (id && id in SKINS) return SKINS[id as SkinId];
  return SKINS.evangelina;
}
