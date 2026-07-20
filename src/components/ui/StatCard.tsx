import { cn } from "@/lib/utils";
import { InfoIcon } from "@/components/ui/Icons";

// `warn` (red) means genuinely urgent — something overdue, blocked, or
// needing action right now. For a number that's merely down or worth a
// second look but isn't an active problem, use `tone="caution"` (amber)
// instead — red loses its meaning if every dip in a routine metric uses it.
// `projected` is a distinct third mode for a figure that isn't real money
// at all (a forecast/estimate) — dashed border + a small "Projected" tag,
// visually different from `warn` at a glance rather than relying on the
// same solid amber border a merely-cautious real number would also get.
export function StatCard({
  label, value, sub, warn, tone = "danger", projected, info,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean; tone?: "danger" | "caution"; projected?: boolean;
  /** Short plain-language explanation of exactly what this number counts — shown in a hover tooltip off a small info icon next to the label, so the formula behind a figure like this is never a mystery. */
  info?: string;
}) {
  return (
    <div className={cn("stat-card", projected ? "border-dashed border-amber/50 bg-amber/5" : warn && (tone === "caution" ? "border-amber/40" : "border-rausch/40"))}>
      <div className="flex min-h-[32px] items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[12px] font-bold uppercase leading-tight tracking-wide text-[var(--gray)]">
          <span>{label}</span>
          {info && (
            <span className="group/info relative inline-flex flex-none">
              <InfoIcon className="h-3 w-3 cursor-help text-[var(--gray)]/60 hover:text-[var(--ink)]" />
              <span className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-20 w-[190px] -translate-x-1/2 rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-center text-[11px] font-semibold normal-case leading-snug tracking-normal text-[var(--bg)] opacity-0 shadow-card transition-opacity group-hover/info:opacity-100">
                {info}
              </span>
            </span>
          )}
        </div>
        {projected && (
          <span className="flex-none rounded-full bg-amber/15 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-amber whitespace-nowrap">Est.</span>
        )}
      </div>
      <div className={cn("mt-1.5 text-[24px] font-extrabold tracking-tight", projected ? "text-amber" : warn && (tone === "caution" ? "text-amber" : "text-rausch"))}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[var(--gray)]">{sub}</div>}
    </div>
  );
}
