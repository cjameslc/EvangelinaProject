import Link from "next/link";
import { GUIDE_TILES } from "@/lib/guideNav";

/**
 * The default landing page: an image-first tile grid, one card per Guide
 * section, completely independent of the Booking module (see BookFlowView
 * for the separate booking flow). 4-col desktop / 2-col tablet / 1-col
 * mobile per the spec. No client-side state needed — hover/scale is plain
 * CSS, so this stays a server component.
 */
export function GuideHubView({ hostName }: { hostName: string | null }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 text-center sm:mb-10">
        <div className="text-[11px] font-bold uppercase tracking-wide text-rausch">Digital Guidebook</div>
        <h1 className="mt-1 text-[30px] font-extrabold tracking-tight sm:text-[38px]">
          Welcome to Evangelina&apos;s Staycation
        </h1>
        <p className="mx-auto mt-2 max-w-[560px] text-[14.5px] leading-relaxed text-[var(--gray)]">
          Everything you need for your stay in one place{hostName ? ` — hosted by ${hostName}` : ""}. Browse below, or{" "}
          <Link href="/book" className="font-bold text-rausch hover:underline">book a unit</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GUIDE_TILES.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-[var(--bg-2)] shadow-s transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(0,0,0,.22)]"
          >
            {tile.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tile.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[var(--bg-2)] to-[var(--card)] text-5xl opacity-70">
                {tile.icon}
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="relative z-10 p-4">
              <div className="text-[24px] leading-none drop-shadow">{tile.icon}</div>
              <div className="mt-1.5 text-[15px] font-extrabold leading-tight text-white drop-shadow">{tile.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-white/85 drop-shadow">{tile.subtitle}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
