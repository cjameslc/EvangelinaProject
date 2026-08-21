import type { HealthVerdict } from "@/lib/analytics/profitability";

// Brief section 1 — "Do not soften the conclusion." A deterministic
// 5-band verdict (computeBusinessHealthVerdict) rendered as a single,
// unmissable banner at the very top of the Metrics tab, above the KPI row.
const BAND_STYLE: Record<HealthVerdict["band"], { emoji: string; label: string; bg: string; fg: string }> = {
  winning: { emoji: "🟢", label: "WINNING", bg: "bg-teal/10", fg: "text-teal" },
  surviving: { emoji: "🟡", label: "SURVIVING / FRAGILE", bg: "bg-amber/10", fg: "text-amber" },
  at_risk: { emoji: "🟠", label: "AT RISK", bg: "bg-amber/10", fg: "text-amber" },
  losing: { emoji: "🔴", label: "LOSING MONEY", bg: "bg-rausch/10", fg: "text-rausch" },
  unsustainable: { emoji: "⚫", label: "UNSUSTAINABLE", bg: "bg-rausch/10", fg: "text-rausch" },
};

export function BusinessHealthBanner({ verdict }: { verdict: HealthVerdict }) {
  const style = BAND_STYLE[verdict.band];
  return (
    <div className={`card mb-5 border-2 p-5 ${style.bg}`} style={{ borderColor: "currentColor" }}>
      <div className={style.fg}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[22px] leading-none">{style.emoji}</span>
          <span className="text-[13px] font-extrabold uppercase tracking-wider">{style.label}</span>
        </div>
        <p className="mt-2 text-[16px] font-extrabold tracking-tight">{verdict.headline}</p>
        {verdict.reasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {verdict.reasons.map((r, i) => (
              <li key={i} className="text-[12.5px] font-medium text-[var(--ink)]">• {r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
