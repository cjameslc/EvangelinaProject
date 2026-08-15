import { cn } from "@/lib/utils";
import { ClockIcon, CheckIcon, RefreshIcon } from "@/components/ui/Icons";

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

// Housekeeping status is an operational signal staff act on under time
// pressure — color alone isn't a reliable channel (color-blind readers,
// low-light phone screens on-site) and a mis-read here means a guest
// arrives to an unready room. Icon reinforces the same meaning color
// already carries, it doesn't add new information. Every other Tag variant
// (platform, payment method, stay type) stays icon-free — those are
// descriptive labels, not a status a mistake on which causes an
// operational failure.
const HOUSEKEEPING_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  todo: ClockIcon,
  cleaning: RefreshIcon,
  clean: CheckIcon,
};

export function Tag({ variant, children }: { variant: string; children: React.ReactNode }) {
  const key = variant.toLowerCase().replace(/\s/g, "");
  const Icon = HOUSEKEEPING_ICONS[key];
  return (
    <span className={cn("tag", STYLES[key] ?? STYLES.other)}>
      {Icon && <Icon className="h-3 w-3 flex-none" />}
      {children}
    </span>
  );
}
