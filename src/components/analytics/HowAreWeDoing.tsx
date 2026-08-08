"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ExecutiveKPIs } from "@/app/analytics/queries";

/**
 * A deterministic, rule-based summary built from real KPI deltas — never
 * AI-generated (that's what AIInsightsPanel is for, a separate component
 * this doesn't duplicate) and never generic static copy. Every sentence
 * traces directly to a real number already computed in getExecutiveKPIs.
 */
export function HowAreWeDoing({ kpis }: { kpis: ExecutiveKPIs }) {
  const prefersReduced = useReducedMotion();
  const { headline, strongest, opportunity } = buildSummary(kpis);

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: prefersReduced ? 0 : 0.45 }}
      className="card p-5"
    >
      <div className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--gray)]">How are we doing?</div>
      <p className="mt-2 text-[15px] font-semibold leading-relaxed text-[var(--ink)]">{headline}</p>
      {strongest && <p className="mt-2 text-[13.5px] text-[var(--gray)]">Your strongest metric is <span className="font-bold text-teal">{strongest}</span>.</p>}
      {opportunity && <p className="mt-1 text-[13.5px] text-[var(--gray)]">Your main opportunity is <span className="font-bold text-amber">{opportunity}</span>.</p>}
    </motion.div>
  );
}

function buildSummary(kpis: ExecutiveKPIs): { headline: string; strongest: string | null; opportunity: string | null } {
  // Only real growth-% fields ranked here — occupancy/ADR/RevPAR/bookings
  // don't have a growth-% field exposed yet (see ExecutiveKPIs), so they're
  // deliberately left out of "strongest/opportunity" rather than ranked
  // against a fabricated delta.
  const candidates: { name: string; delta: number | null }[] = [
    { name: "revenue", delta: kpis.revenueGrowthPct },
    { name: "net profit", delta: kpis.profitGrowthPct },
    { name: "margin", delta: kpis.marginPctPointsDelta },
  ];
  const ranked = candidates.filter((m): m is { name: string; delta: number } => m.delta !== null);

  const strongest = ranked.length ? ranked.reduce((a, b) => (b.delta > a.delta ? b : a)).name : null;
  const opportunity = ranked.length > 1 ? ranked.reduce((a, b) => (b.delta < a.delta ? b : a)).name : null;

  const revenuePart =
    kpis.revenueGrowthPct === null
      ? "This is the first period with data to compare"
      : `Revenue is ${kpis.revenueGrowthPct >= 0 ? "up" : "down"} ${Math.abs(kpis.revenueGrowthPct)}%`;
  const profitPart = kpis.profitGrowthPct === null ? "" : `, net profit is ${kpis.profitGrowthPct >= 0 ? "up" : "down"} ${Math.abs(kpis.profitGrowthPct)}%`;
  const occPart = `, and occupancy stands at ${kpis.occupancyPct}%`;
  const comparedTo = kpis.revenueGrowthPct === null ? "." : ` vs ${kpis.comparisonPeriodLabel}.`;

  const headline = `${revenuePart}${profitPart}${occPart}${comparedTo}`;

  return { headline, strongest, opportunity: opportunity !== strongest ? opportunity : null };
}
