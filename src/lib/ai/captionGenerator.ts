import { askGeminiJSON } from "@/lib/ai/geminiClient";
import { PLATFORM_DEFS, STYLE_DEFS, type PlatformKey, type StyleKey } from "@/lib/socialPlatforms";

export type CaptionGenInput = {
  categoryLabel: string;
  categoryDescription: string;
  month: string; // e.g. "August 2026"
  availableDatesSummary: string; // e.g. "Aug 3, 5, 12-14, 20" or "fully booked"
  businessName: string;
  location: string;
  contact: string; // phone or Messenger handle, already formatted
  // All optional — the generic (property-wide) caption tab omits these;
  // a per-unit opportunity card fills them in with real computed facts.
  platform?: PlatformKey;
  style?: StyleKey;
  unitName?: string;
  price?: string; // already-formatted peso string, e.g. "₱1,499"
  amenities?: string[];
  promoNote?: string;
  bookingLink?: string;
};

export type CaptionGenResult = {
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

// Same "no-invention" discipline as generateDashboardInsight and the guest
// AI Assistant — every concrete fact (dates, business name, location,
// contact, price, unit) is handed in as real data; Gemini only ever writes
// marketing copy around it, never invents a date, price, or promo that
// isn't present in the input.
const SYSTEM_PROMPT = `You are a social media copywriter for a short-term staycation rental business (not an event venue) in the Philippines. Write in a warm, casual Filipino-English ("Taglish" is fine) social media voice — the kind used on Facebook/TikTok/Instagram by small local staycation businesses. Keep it short and scannable, not corporate.

Use ONLY the real facts given in the JSON input — never invent a date, price, promo, amenity, or detail not present there. If a field (platform, style, price, amenities, promoNote, bookingLink, unitName) is missing from the input, simply don't reference it — don't invent a substitute. Match the "platform" field's formatting/length guidance and the "style" field's tone exactly when present; default to a general Facebook-style promotional tone when absent.

Respond with JSON matching exactly: { "headline": string, "caption": string, "cta": string, "hashtags": string[] }. headline is one short attention-grabbing line (may include an emoji). caption is 2-4 short sentences/lines (or fewer, per platform length guidance). cta is one short call-to-action line ending with the given contact info (and booking link, if given). hashtags is 6-10 relevant hashtags (each starting with #, no spaces), mixing property/location tags with the content angle — do not repeat the same tag twice.`;

export async function generateCaption(input: CaptionGenInput): Promise<CaptionGenResult> {
  const platformDef = input.platform ? PLATFORM_DEFS.find((p) => p.key === input.platform) : undefined;
  const styleDef = input.style ? STYLE_DEFS.find((s) => s.key === input.style) : undefined;
  const payload = {
    ...input,
    platform: platformDef ? { key: platformDef.key, guidance: platformDef.guidance } : undefined,
    style: styleDef ? { key: styleDef.key, guidance: styleDef.guidance } : undefined,
  };
  // No model override — geminiClient's default is already the cheapest
  // model confirmed live on this account's key (see the comment there).
  const result = await askGeminiJSON<CaptionGenResult>(SYSTEM_PROMPT, `REAL DATA (JSON):\n${JSON.stringify(payload)}`);
  // Defensive normalization — Gemini's JSON mode is schema-obedient in
  // practice, but a caller displaying this straight into the UI shouldn't
  // crash on a missing/malformed field from an external API.
  return {
    headline: String(result.headline ?? "").trim(),
    caption: String(result.caption ?? "").trim(),
    cta: String(result.cta ?? "").trim(),
    hashtags: Array.isArray(result.hashtags) ? result.hashtags.filter((h) => typeof h === "string" && h.trim()).map((h) => (h.startsWith("#") ? h : `#${h}`)) : [],
  };
}
