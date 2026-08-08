"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Wallet, TrendingUp, Percent, Home, Tag, Gauge, CalendarCheck } from "lucide-react";

// A string key, not a component reference, crosses the analytics/page.tsx
// (Server Component) -> MetricKpiCard (Client Component) boundary — Next's
// RSC serialization forbids passing function/component values as props
// across that boundary at all ("Functions cannot be passed directly to
// Client Components"), which is a hard crash, not a lint warning. Caught
// by actually loading the page, not by typechecking (this compiles fine).
const METRIC_ICONS = {
  wallet: Wallet,
  "trending-up": TrendingUp,
  percent: Percent,
  home: Home,
  tag: Tag,
  gauge: Gauge,
  "calendar-check": CalendarCheck,
} as const;
export type MetricIconKey = keyof typeof METRIC_ICONS;

/** Deterministic "trending" label from a delta — same three buckets used
 * everywhere on this card (never a bare arrow with no words next to it,
 * so performance is never communicated by color alone — brief section 37). */
function trendWord(delta: number | null): string {
  if (delta === null) return "No prior period";
  if (delta > 0) return "Trending upward";
  if (delta < 0) return "Trending downward";
  return "Holding steady";
}

export function MetricKpiCard({
  icon,
  label,
  value,
  delta,
  deltaUnit = "%",
  comparisonLabel,
  index = 0,
}: {
  icon: MetricIconKey;
  label: string;
  value: string;
  /** Signed delta — percent by default, or percentage points (deltaUnit="pts") for a metric that's already itself a percent (e.g. Margin, Occupancy). Null = no prior period to compare. */
  delta: number | null;
  deltaUnit?: "%" | "pts";
  comparisonLabel: string;
  /** Stagger position for the entrance animation — brief section 27: "KPI cards 100-250ms stagger". */
  index?: number;
}) {
  const prefersReduced = useReducedMotion();
  const isUp = delta !== null && delta >= 0;
  const Icon = METRIC_ICONS[icon];

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: prefersReduced ? 0 : 0.1 + index * 0.05 }}
      className="card p-4"
    >
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">
        <Icon className="h-4 w-4" style={{ color: "var(--skin-primary, #6C5CE7)" }} />
        {label}
      </div>
      <div className="mt-2 text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{value}</div>
      {delta !== null ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold">
          <span className={isUp ? "text-teal" : "text-rausch"}>
            {isUp ? "↑" : "↓"} {Math.abs(delta)}
            {deltaUnit === "pts" ? " pts" : "%"}
          </span>
          <span className="font-medium text-[var(--gray)]">vs {comparisonLabel}</span>
        </div>
      ) : (
        <div className="mt-1.5 text-[13px] font-medium text-[var(--gray)]">No prior {comparisonLabel} data</div>
      )}
      <div className="mt-1 text-[11.5px] font-semibold text-[var(--gray)]">{trendWord(delta)}</div>
    </motion.div>
  );
}
