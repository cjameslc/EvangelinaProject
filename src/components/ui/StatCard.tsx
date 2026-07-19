import { cn } from "@/lib/utils";

// `warn` (red) means genuinely urgent — something overdue, blocked, or
// needing action right now. For a number that's merely down or worth a
// second look but isn't an active problem, use `tone="caution"` (amber)
// instead — red loses its meaning if every dip in a routine metric uses it.
export function StatCard({
  label, value, sub, warn, tone = "danger",
}: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean; tone?: "danger" | "caution";
}) {
  return (
    <div className={cn("stat-card", warn && (tone === "caution" ? "border-amber/40" : "border-rausch/40"))}>
      <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className={cn("mt-1.5 text-[24px] font-extrabold tracking-tight", warn && (tone === "caution" ? "text-amber" : "text-rausch"))}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[var(--gray)]">{sub}</div>}
    </div>
  );
}
