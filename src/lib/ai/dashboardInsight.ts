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
};

// Every value below is a pre-computed, pre-formatted real number from the
// Dashboard's own metrics (same figures the fixed-template version used) —
// Gemini only ever rephrases these into natural prose, never computes or
// invents a new figure. Same "no-invention" discipline as the guest AI
// Assistant (src/lib/ai/assistantService.ts).
const SYSTEM_PROMPT = `You write a short, plain-language business insight for the "Key metrics" card on a short-term rental property management dashboard (Evangelina's Staycation, a 5-unit property in Cubao, Quezon City, Philippines). The reader is the owner/admin.

Use ONLY the real numbers in the JSON below — never invent, estimate, or recompute a figure that isn't given. Write 2-4 short sentences, plain business language, no markdown, no bullet points, no emoji, no headings. Lead with anything urgent (overdue payments), then break-even progress, then booking/occupancy performance, then cash flow if relevant — but write it as natural prose, not a checklist.`;

export async function generateDashboardInsight(metrics: DashboardInsightMetrics): Promise<string> {
  const raw = await askGemini(SYSTEM_PROMPT, `REAL DATA (JSON):\n${JSON.stringify(metrics)}`);
  return raw.trim();
}
