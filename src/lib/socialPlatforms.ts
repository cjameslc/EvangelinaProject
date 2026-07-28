// Platform and tone-style axes for the AI caption generator — each fed
// into the same real-data-grounded prompt (captionGenerator.ts), never a
// separate source of invented facts.

export type PlatformKey = "facebook" | "tiktok" | "ig_feed" | "ig_story" | "threads" | "x";
export type PlatformDef = { key: PlatformKey; label: string; guidance: string };

export const PLATFORM_DEFS: PlatformDef[] = [
  { key: "facebook", label: "Facebook", guidance: "Facebook post — warm, a little longer/storytelling is fine, 2-5 short lines, emojis welcome." },
  { key: "tiktok", label: "TikTok", guidance: "TikTok caption for a video/photo post — very short, punchy, trend-casual tone, 1-2 short lines plus hashtags." },
  { key: "ig_feed", label: "Instagram Feed", guidance: "Instagram feed post — aesthetic, warm, a short caption (2-4 lines) that reads well under a photo." },
  { key: "ig_story", label: "Instagram Story", guidance: "Instagram Story overlay text — extremely short (under 12 words for the headline, one short line for the rest), meant to be read in 2 seconds." },
  { key: "threads", label: "Threads", guidance: "Threads post — conversational, casual, short (under 280 characters total), reads like a real update from a small business owner." },
  { key: "x", label: "X (Twitter)", guidance: "X/Twitter post — very short (under 280 characters total), punchy, no fluff." },
];

export type StyleKey = "promotional" | "urgency" | "friendly" | "luxury";
export type StyleDef = { key: StyleKey; label: string; guidance: string };

export const STYLE_DEFS: StyleDef[] = [
  { key: "promotional", label: "Promotional", guidance: "Straightforward promotional tone — clear offer, clear dates, clear CTA." },
  { key: "urgency", label: "Urgency", guidance: "Urgency/scarcity tone — emphasize limited dates/slots remaining, encourage booking now." },
  { key: "friendly", label: "Friendly", guidance: "Warm, casual, friendly neighbor tone — like messaging a friend, light emoji use." },
  { key: "luxury", label: "Luxury", guidance: "Elevated, premium-hospitality tone — polished language, understated confidence, minimal emoji." },
];

export type CaptionToggleKey = "price" | "amenities" | "promo" | "bookingLink" | "contact" | "unitNumber";
export const CAPTION_TOGGLES: { key: CaptionToggleKey; label: string; defaultOn: boolean }[] = [
  { key: "price", label: "Price", defaultOn: true },
  { key: "amenities", label: "Amenities", defaultOn: false },
  { key: "promo", label: "Promo", defaultOn: false },
  { key: "bookingLink", label: "Booking link", defaultOn: true },
  { key: "contact", label: "Contact details", defaultOn: true },
  { key: "unitNumber", label: "Unit number", defaultOn: true },
];
