"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Grain } from "@/components/ui/Grain";
import { useSeasonalSkin } from "@/components/skins/SeasonalSkinProvider";
import { pesoCentavos } from "@/lib/format";
import type { ExecutiveKPIs } from "@/app/analytics/queries";

/**
 * Premium analytics hero — dark glass card tinted by whichever seasonal
 * skin is active, real MTD revenue (see mtdRevenueCentavos's doc comment
 * in queries.ts for why this isn't the same number as the KPI row's Total
 * Revenue), a correctly like-for-like growth %, and one honest,
 * deterministic sentence built from the real delta — never a fabricated or
 * generic line.
 *
 * The base gradient itself is derived from skin.colors.primary (via
 * color-mix, not a second hardcoded palette) — it used to stay a fixed
 * dark violet always, with a skin's own color only ever layered on top as
 * a glow accent, which meant selecting e.g. the "Airbnb Style" skin still
 * left this one card visibly violet underneath a red glow instead of
 * actually reading as "back to the original all-red design" like every
 * other primary-action surface in the app already does. Only
 * `colors.primary` is used for the base — `colors.secondary` is
 * deliberately not (see airbnb's own config comment: it's white, tuned for
 * CTA/on-photo text contexts elsewhere, not a second gradient stop for a
 * dark hero).
 */
export function MetricsHero({ kpis, periodLabel }: { kpis: ExecutiveKPIs; periodLabel: string }) {
  const skin = useSeasonalSkin();
  const prefersReduced = useReducedMotion();
  const growth = kpis.revenueGrowthPct;
  const isUp = growth !== null && growth >= 0;

  const line = growthSentence(growth);
  const seasonal = skin.id !== "evangelina";
  const primary = skin.colors.primary;

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative isolate overflow-hidden rounded-[28px] p-7 text-white shadow-[0_20px_60px_-20px_rgba(76,29,149,.55)] sm:p-9"
      style={{
        background: `radial-gradient(120% 140% at 15% 0%, ${primary}55 0%, transparent 55%), linear-gradient(160deg, color-mix(in srgb, ${primary} 22%, #0a0912) 0%, color-mix(in srgb, ${primary} 34%, #0a0912) 55%, color-mix(in srgb, ${primary} 46%, #0a0912) 100%)`,
      }}
    >
      <Grain />
      {/* Ambient glow blob — pure decoration, not the seasonal ambience layer (which carries real per-skin emoji); a restrained business-dashboard treatment per the brief's own "not a gaming screen" note. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: primary, opacity: 0.35 }}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
          <span>{periodLabel} Performance</span>
          {seasonal && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-white/85 backdrop-blur-sm">
              {skin.emoji} {skin.name}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="text-[40px] font-extrabold tracking-tight sm:text-[52px]">{pesoCentavos(kpis.mtdRevenueCentavos)}</span>
          <span className="mb-2 text-[13px] font-semibold text-white/60">Revenue</span>
        </div>

        {growth !== null && (
          <div className="mt-2 flex items-center gap-2 text-[14px] font-bold">
            <span className={isUp ? "text-emerald-300" : "text-rose-300"}>
              {isUp ? "↑" : "↓"} {Math.abs(growth)}%
            </span>
            <span className="font-medium text-white/60">vs {kpis.comparisonPeriodLabel}</span>
          </div>
        )}

        <p className="mt-3 max-w-[480px] text-[15px] font-medium leading-relaxed text-white/85">{line}</p>
      </div>
    </motion.div>
  );
}

/** A short, honest, deterministic line from the real growth delta — never a fabricated or generic sentence, and never spun positive when the number isn't (brief section 7: "positive presentation, honest data"). */
function growthSentence(growthPct: number | null): string {
  if (growthPct === null) return "This is the first period with data to compare against — check back next period for a trend.";
  if (growthPct >= 15) return "You're building strong momentum this period.";
  if (growthPct >= 1) return "You're ahead of the comparison period.";
  if (growthPct === 0) return "Holding steady with the comparison period.";
  if (growthPct >= -14) return "Revenue is below the comparison period.";
  return "Revenue is notably below the comparison period — worth a closer look.";
}
