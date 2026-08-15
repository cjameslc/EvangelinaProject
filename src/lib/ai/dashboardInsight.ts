import { askGemini } from "@/lib/ai/geminiClient";

export type DashboardInsightMetrics = {
  overdueAmount: string | null;
  breakEvenStatus: "early_month" | "no_completed_income" | "remaining" | "covered";
  remainingToBreakEven: string | null;
  coveragePct: number | null;
  bookingsCount: number;
  completedRevenue: string;
  occupancyPct: number;
  cashFlowIsZero: boolean;
  forecastIsNegative: boolean;
  /** Occupied nights/bookings this period, broken down by stay type — only
   * the types that actually have nights > 0 (mirrors what the deterministic
   * fallback line shows). Omitted (undefined) when nothing's occupied. */
  nightsByStayType?: { label: string; hrs: string; nights: number; bookings: number }[];
};

export type BusinessContext = { businessName: string; unitCount: number; address: string };

// Every value below is a pre-computed, pre-formatted real number from the
// Dashboard's own metrics (same figures the fixed-template version used) —
// Gemini only ever rephrases these into natural prose, never computes or
// invents a new figure. Same "no-invention" discipline as the guest AI
// Assistant (src/lib/ai/assistantService.ts).
//
// businessName/unitCount/address come from the calling owner's own real
// Owner/Settings/Unit rows (see the route), never hardcoded — this used to
// say "Evangelina's Staycation, a 5-unit property in Cubao" unconditionally
// for every owner on the platform, which would have been simply false for
// any other tenant.
function buildSystemPrompt(business: BusinessContext): string {
  return `You write a short, plain-language business insight for the "Key metrics" card on a short-term rental property management dashboard (${business.businessName}, a ${business.unitCount}-unit property in ${business.address}). The reader is the owner/admin.

Use ONLY the real numbers in the JSON below — never invent, estimate, or recompute a figure that isn't given. Write 3-6 short sentences, plain business language, no markdown, no bullet points, no emoji, no headings. Lead with anything urgent (overdue payments), then break-even progress, then booking/occupancy performance, then cash flow if relevant. If nightsByStayType is present, close with a sentence naturally summarizing how occupied nights split across stay types (e.g. which stay type drove the most nights/bookings) — write it as natural prose, not a checklist or a repeated list of every number.`;
}

export async function generateDashboardInsight(metrics: DashboardInsightMetrics, business: BusinessContext): Promise<string> {
  const raw = await askGemini(buildSystemPrompt(business), `REAL DATA (JSON):\n${JSON.stringify(metrics)}`);
  return raw.trim();
}
