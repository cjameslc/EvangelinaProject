import { TransitionLink } from "@/components/guest/TransitionLink";

const SHORTCUTS = [
  { href: "/guide/nearby/food", icon: "🍔", label: "Restaurants" },
  { href: "/guide/nearby/coffee", icon: "☕", label: "Coffee" },
  { href: "/guide/nearby/grocery", icon: "🛒", label: "Grocery" },
  { href: "/guide/nearby/transportation", icon: "🚆", label: "Transport" },
];

/** A premium, layered-gradient welcome banner for the Nearby/Digital
 * Guidebook experience — purely presentational (the real search/filter UI
 * it fronts already lives in NearbyPlacesSection right below it). */
export function NearbyHero() {
  return (
    <div className="relative mb-5 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-navy via-navy to-[#1a3a6b] px-5 py-8 shadow-[0_24px_60px_rgba(11,30,61,.35)] sm:px-8 sm:py-12">
      {/* Layered gradient glow + soft floating shapes — decorative only. */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-rausch/20 blur-3xl" />

      <div className="relative animate-fade-up">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-md">
          ✨ Digital Guidebook
        </div>
        <h2 className="mt-3 max-w-[420px] text-[26px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[32px]">
          Discover Cubao <span className="bg-gradient-to-r from-gold to-[#f0d98a] bg-clip-text text-transparent">Like a Local</span>
        </h2>
        <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-white/80">
          Everything you need is just minutes from Evangelina&rsquo;s Staycation.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {SHORTCUTS.map((s) => (
            <TransitionLink
              key={s.href}
              href={s.href}
              className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[12.5px] font-bold text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <span>{s.icon}</span> {s.label}
            </TransitionLink>
          ))}
        </div>
      </div>
    </div>
  );
}
