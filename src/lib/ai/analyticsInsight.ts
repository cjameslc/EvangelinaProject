import { askGeminiJSON } from "@/lib/ai/geminiClient";

export type InsightPointType = "positive" | "risk" | "opportunity" | "neutral";
export type InsightPoint = { type: InsightPointType; title: string; detail: string };
export type AnalyticsInsightResult = { summary: string; points: InsightPoint[]; recommendation: string | null };

/**
 * One shared prompt shape for every Analytics AI Insights panel (Executive,
 * Revenue & Financial, Operations & Team) rather than a bespoke prompt per
 * individual chart/KPI — that would mean 8-9 separate Gemini calls on a
 * single page load. Grouping into 3 richer calls covers every metric in the
 * spec (every field passed in `data` is fair game for the model to discuss)
 * while keeping real cost/latency bounded, matching this app's existing
 * dashboardInsight.ts "no-invention" discipline: `data` is always real,
 * pre-computed numbers already scoped to the viewer's role/portfolio by the
 * caller (see queries.ts's effectiveUnitIds) — Gemini only interprets and
 * narrates them, never computes or invents a figure.
 */
const RESPONSE_SHAPE_INSTRUCTIONS = `Respond with ONLY valid JSON, no markdown code fences, matching exactly this shape:
{"summary": string, "points": [{"type": "positive"|"risk"|"opportunity"|"neutral", "title": string, "detail": string}], "recommendation": string|null}

Rules:
- Use ONLY the real numbers in the JSON data below — never invent, estimate, or recompute a figure that isn't present. If a field is null, zero from no data, or a confidence label says "low", say so honestly instead of guessing a trend.
- "summary": 1-2 sentences, the single most important takeaway.
- "points": 2-5 items. "positive" = something going well worth highlighting. "risk" = something that needs attention (cancellations, overdue, low occupancy, a losing unit). "opportunity" = an actionable gap (an underused unit, an untapped booking source). "neutral" = context worth knowing that isn't good or bad.
- "recommendation": one concrete, specific next action tied to the real numbers, or null if nothing concrete applies — never a generic platitude like "keep monitoring performance."
- Plain business language, no markdown, no emoji, no headings inside the text fields.`;

function roleContext(role: string, ownedUnitIds: string[]): string {
  const scoped = role === "CO_OWNER" || (role === "OWNER_ADMIN" && ownedUnitIds.length > 0);
  return scoped
    ? "The reader is a Co-Owner who only manages a scoped subset of the property's units — write only about their own units, never imply visibility into the whole property."
    : "The reader is the Owner/Admin who manages the entire property portfolio.";
}

async function generate(focus: string, data: unknown, role: string, ownedUnitIds: string[]): Promise<AnalyticsInsightResult> {
  const systemPrompt = `You are a business analyst writing AI-generated insights for the Analytics dashboard of Evangelina's Staycation, a short-term rental property (Daycation and overnight stays) in Cubao, Quezon City, Philippines.

${roleContext(role, ownedUnitIds)}

Focus of this analysis: ${focus}

${RESPONSE_SHAPE_INSTRUCTIONS}`;

  const raw = await askGeminiJSON<AnalyticsInsightResult>(systemPrompt, `REAL DATA (JSON):\n${JSON.stringify(data)}`);

  if (!raw || typeof raw.summary !== "string" || !Array.isArray(raw.points)) {
    throw new Error("Gemini returned an unexpected shape.");
  }
  return {
    summary: raw.summary,
    points: raw.points.filter((p) => p && typeof p.title === "string" && typeof p.detail === "string").slice(0, 5),
    recommendation: typeof raw.recommendation === "string" ? raw.recommendation : null,
  };
}

export function generateExecutiveInsight(data: unknown, role: string, ownedUnitIds: string[]) {
  return generate(
    "The Executive Summary — overall revenue, profit, occupancy, ADR, RevPAR, bookings, cancellations, repeat guests, and the period-over-period comparison and forecast included in the data.",
    data,
    role,
    ownedUnitIds
  );
}

export function generateRevenueInsight(data: unknown, role: string, ownedUnitIds: string[]) {
  return generate(
    "Revenue performance — the revenue trend over time, which units/booking sources/stay types/payment methods are driving revenue, and the financial position (cash flow, outstanding balances, expenses).",
    data,
    role,
    ownedUnitIds
  );
}

export function generateOperationsInsight(data: unknown, role: string, ownedUnitIds: string[]) {
  return generate(
    "Operations and team performance — the booking funnel and lead times, occupancy and peak days, guest mix (new vs. returning), housekeeping turnaround, staff/booker activity, and which units are the best and worst performers.",
    data,
    role,
    ownedUnitIds
  );
}
