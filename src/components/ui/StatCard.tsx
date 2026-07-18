import { cn } from "@/lib/utils";

export function StatCard({ label, value, sub, warn }: { label: string; value: React.ReactNode; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div className={cn("stat-card", warn && "border-rausch/40")}>
      <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className={cn("mt-1.5 text-[24px] font-extrabold tracking-tight", warn && "text-rausch")}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-[var(--gray)]">{sub}</div>}
    </div>
  );
}
