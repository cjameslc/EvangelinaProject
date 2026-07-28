import { askGeminiJSON } from "@/lib/ai/geminiClient";

export type CaptionGenInput = {
  categoryLabel: string;
  categoryDescription: string;
  month: string; // e.g. "August 2026"
  availableDatesSummary: string; // e.g. "Aug 3, 5, 12-14, 20" or "fully booked"
  businessName: string;
  location: string;
  contact: string; // phone or Messenger handle, already formatted
};

export type CaptionGenResult = {
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

// Same "no-invention" discipline as generateDashboardInsight and the guest
// AI Assistant — every concrete fact (dates, business name, location,
// contact) is handed in as real data; Gemini only ever writes marketing
// copy around it, never invents a date or promo that isn't real.
const SYSTEM_PROMPT = `You are a social media copywriter for a short-term staycation rental business (not an event venue) in the Philippines. Write in a warm, casual Filipino-English ("Taglish" is fine) social media voice — the kind used on Facebook/TikTok/Instagram by small local staycation businesses. Keep it short and scannable, not corporate.

Use ONLY the real facts given in the JSON input — never invent a date, price, promo, or detail not present there. Respond with JSON matching exactly: { "headline": string, "caption": string, "cta": string, "hashtags": string[] }. headline is one short attention-grabbing line (may include an emoji). caption is 2-4 short sentences/lines. cta is one short call-to-action line ending with the given contact info. hashtags is 6-10 relevant hashtags (each starting with #, no spaces), mixing property/location tags with the content angle — do not repeat the same tag twice.`;

export async function generateCaption(input: CaptionGenInput): Promise<CaptionGenResult> {
  // No model override — geminiClient's default is already the cheapest
  // model confirmed live on this account's key (see the comment there).
  const result = await askGeminiJSON<CaptionGenResult>(SYSTEM_PROMPT, `REAL DATA (JSON):\n${JSON.stringify(input)}`);
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
