import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  airbnb: "bg-rausch/15 text-rausch",
  facebook: "bg-fb/15 text-fb",
  tiktok: "bg-black/10 text-ink dark:bg-white/10",
  other: "bg-[var(--bg-2)] text-[var(--gray)]",
  cash: "bg-green/15 text-green",
  gcash: "bg-gcash/15 text-gcash",
  banktransfer: "bg-violet/15 text-violet",
  day: "bg-amber/15 text-amber",
  night: "bg-violet/15 text-violet",
  full: "bg-rausch/15 text-rausch",
  paid: "bg-green/15 text-green",
  unpaid: "bg-rausch/15 text-rausch",
  todo: "bg-amber/15 text-amber",
  cleaning: "bg-teal/15 text-teal",
  clean: "bg-green/15 text-green",
  cancelled: "bg-[var(--bg-2)] text-[var(--gray)] line-through",
  refunded: "bg-violet/15 text-violet",
};

export function Tag({ variant, children }: { variant: string; children: React.ReactNode }) {
  const key = variant.toLowerCase().replace(/\s/g, "");
  return <span className={cn("tag", STYLES[key] ?? STYLES.other)}>{children}</span>;
}
