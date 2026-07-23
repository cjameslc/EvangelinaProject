import type { TileArt } from "@/lib/guideNav";

/**
 * Generated cover art for a Guide tile/page that has no real photo — a
 * brand-consistent gradient plus a scattered icon motif and a badged
 * center icon, so every tile in the grid (and its own page header) feels
 * equally designed even without photography. Positions are deterministic
 * (index-driven modulo, same technique as CinematicHero's dust motes) so
 * this renders identically on the server and after hydration — no
 * Math.random() here.
 */
export function TileCoverArt({ icon, art, patternCount = 9 }: { icon: string; art: TileArt; patternCount?: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${art.gradient[0]}, ${art.gradient[1]})` }}
    >
      <div className="pointer-events-none absolute inset-0">
        {Array.from({ length: patternCount }).map((_, i) => (
          <span
            key={i}
            className="absolute select-none opacity-[0.16]"
            style={{
              left: `${(i * 29 + 7) % 100}%`,
              top: `${(i * 53 + 13) % 100}%`,
              fontSize: `${16 + (i % 4) * 8}px`,
              transform: `rotate(${((i * 41) % 40) - 20}deg)`,
            }}
          >
            {art.pattern}
          </span>
        ))}
      </div>
      {/* Soft vignette, same treatment as the photo tiles' bottom gradient — keeps the badge/icon legible. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_20%,rgba(255,255,255,.14),transparent_60%)]" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white/15 text-[30px] shadow-lg ring-1 ring-white/25 backdrop-blur-sm">
          {icon}
        </div>
      </div>
    </div>
  );
}
