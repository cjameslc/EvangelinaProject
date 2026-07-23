import { askGemini } from "@/lib/ai/geminiClient";
import { formatDistance } from "@/lib/places/placeInsightFormat";

export type PlaceOverviewInput = {
  name: string;
  categoryLabel: string;
  distanceMeters: number | null;
  walkMinutes: number | null;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  googleSummary: string | null;
};

const SYSTEM_PROMPT = `You write short "local host" blurbs for a guidebook a short-term rental host gives their guests in Cubao, Quezon City, Philippines.

RULES — read carefully:
- Use ONLY the facts given to you below. Never invent a detail, a claim, a review, a guest story, or a fact not present in the input.
- Never claim popularity, guest favorites, or "many guests love this" — you have no data on that.
- 2-3 short sentences, warm and conversational, like a host giving a quick tip — not a Google listing description copied verbatim.
- If a fact (rating, distance, price) isn't provided, don't mention it or guess it.
- Output ONLY the blurb text, no quotes, no markdown, no preamble.`;

/** A short host-voiced blurb for one place, generated once per refresh and
 * cached on PlaceInsight.hostOverview — strictly grounded in this
 * function's own inputs (see SYSTEM_PROMPT). Returns null (never a
 * fallback string) if generation fails or Gemini isn't configured, so a
 * missing overview is always visibly absent rather than silently wrong. */
export async function generateHostOverview(input: PlaceOverviewInput): Promise<string | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const facts = [
    `Place name: ${input.name}`,
    `Category: ${input.categoryLabel}`,
    input.distanceMeters != null ? `Distance from the property: ${formatDistance(input.distanceMeters)}` : null,
    input.walkMinutes != null ? `Walking time: about ${input.walkMinutes} min` : null,
    input.rating != null ? `Google rating: ${input.rating.toFixed(1)}${input.ratingCount != null ? ` (${input.ratingCount} reviews)` : ""}` : null,
    input.priceLevel != null ? `Price level: ${"₱".repeat(Math.max(1, input.priceLevel))} (Google's 0-4 scale)` : null,
    input.googleSummary ? `Google's own description: "${input.googleSummary}"` : null,
  ].filter(Boolean).join("\n");

  try {
    const text = await askGemini(SYSTEM_PROMPT, facts);
    const trimmed = text.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
