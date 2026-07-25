"use client";

import { useState } from "react";
import { SparkleIcon, CheckIcon, AlertIcon, InfoIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import type { AnalyticsFilters } from "@/app/analytics/queries";

type InsightPointType = "positive" | "risk" | "opportunity" | "neutral";
type InsightPoint = { type: InsightPointType; title: string; detail: string };
type AnalyticsInsightResult = { summary: string; points: InsightPoint[]; recommendation: string | null };

const POINT_STYLE: Record<InsightPointType, { icon: typeof CheckIcon; cls: string }> = {
  positive: { icon: CheckIcon, cls: "border-teal/25 bg-teal/5 text-teal" },
  opportunity: { icon: SparkleIcon, cls: "border-gold/25 bg-gold/5 text-gold" },
  risk: { icon: AlertIcon, cls: "border-rausch/25 bg-rausch/5 text-rausch" },
  neutral: { icon: InfoIcon, cls: "border-[var(--line)] bg-[var(--bg-2)] text-[var(--gray)]" },
};

/**
 * Reusable "AI Insights & Analysis" card — three instances on the Analytics
 * page (Executive Summary, Revenue & Financial, Operations & Team), each
 * generated on request from POST /api/analytics/insight with a `section`
 * key.
 *
 * Click-to-generate, not auto-fetched on load: this app's Gemini API key is
 * on the free tier, which caps at a genuinely small 20 requests/day for
 * this model — shared with the guest-facing AI Concierge and the Dashboard
 * insight. Three panels auto-firing on every Analytics visit (times however
 * many filter combinations get explored in a session) would burn through
 * that shared daily budget fast and could starve the guest concierge, which
 * matters far more. The API route still caches each result for an hour per
 * exact data snapshot, so re-clicking with unchanged numbers costs nothing.
 *
 * Fails silently beyond an inline retry: every widget this enriches already
 * shows its real numbers on its own, so a Gemini outage/quota exhaustion is
 * never a blocking error, just "try again" or "no AI panel."
 */
export function AIInsightsPanel({ section, filters, title }: { section: "executive" | "revenue" | "operations"; filters: AnalyticsFilters; title: string }) {
  const [result, setResult] = useState<AnalyticsInsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  function generate() {
    setLoading(true);
    setFailed(false);
    fetch("/api/analytics/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, filters }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (j?.summary) setResult(j); else setFailed(true); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  return (
    <div className="card border-rausch/15 bg-gradient-to-br from-rausch/[.03] to-gold/[.03] p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SparkleIcon className="h-4 w-4 text-rausch" />
          <h3 className="text-[13.5px] font-extrabold">{title}</h3>
          <span className="rounded-full bg-rausch/10 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-rausch">AI</span>
        </div>
        {!loading && (
          <button onClick={generate} className="btn btn-sm !h-7 !px-2.5 !text-[11px]">
            {result ? "Regenerate" : "Generate insights"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-[var(--bg-2)]" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--bg-2)]" />
        </div>
      ) : failed ? (
        <p className="text-[12px] text-[var(--gray)]">Couldn&apos;t generate insights right now — try again in a moment.</p>
      ) : result ? (
        <>
          <p className="text-[12.5px] leading-relaxed text-[var(--ink)]">{result.summary}</p>

          {result.points.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {result.points.map((pt, i) => {
                const style = POINT_STYLE[pt.type] ?? POINT_STYLE.neutral;
                const Icon = style.icon;
                return (
                  <div key={i} className={cn("flex items-start gap-2 rounded-xl border p-2.5", style.cls)}>
                    <Icon className="mt-0.5 h-3.5 w-3.5 flex-none" />
                    <div className="min-w-0">
                      <p className="text-[11.5px] font-extrabold text-[var(--ink)]">{pt.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--gray)]">{pt.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.recommendation && (
            <div className="mt-3 rounded-xl bg-[var(--ink)] px-3 py-2 text-[11.5px] font-semibold text-[var(--bg)]">
              💡 {result.recommendation}
            </div>
          )}
        </>
      ) : (
        <p className="text-[12px] text-[var(--gray)]">Get an AI-written summary, highlights, and a concrete recommendation from this section&apos;s real numbers.</p>
      )}
    </div>
  );
}
