import { cn } from "@/lib/utils";

// `warn` (red) means genuinely urgent — something overdue, blocked, or
// needing action right now. For a number that's merely down or worth a
// second look but isn't an active problem, use `tone="caution"` (amber)
// instead — red loses its meaning if every dip in a routine metric uses it.
// `projected` is a distinct third mode for a figure that isn't real money
// at all (a forecast/estimate) — dashed border + a small "Projected" tag,
// visually different from `warn` at a glance rather than relying on the
// same solid amber border a merely-cautious real number would also get.
export function StatCard({
  label, value, sub, warn, tone = "danger", projected,
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean; tone?: "danger" | "caution"; projected?: boolean;
}) {
  return (
    <div className={cn("stat-card", projected ? "border-dashed border-amber/50 bg-amber/5" : warn && (tone === "caution" ? "border-amber/40" : "border-rausch/40"))}>
      <div className="flex min-h-[32px] items-center justify-between gap-2">
        <div className="text-[12px] font-bold uppercase leading-tight tracking-wide text-[var(--gray)]">{label}</div>
        {projected && (
          <span className="flex-none rounded-full bg-amber/15 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wide text-amber whitespace-nowrap">Est.</span>
        )}
      </div>
      <div className={cn("mt-1.5 text-[24px] font-extrabold tracking-tight", projected ? "text-amber" : warn && (tone === "caution" ? "text-amber" : "text-rausch"))}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[var(--gray)]">{sub}</div>}
    </div>
  );
}
