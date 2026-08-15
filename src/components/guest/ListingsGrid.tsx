"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { peso, formatUnitDisplay, fmtTimeStr } from "@/lib/format";
import { manilaTodayISO } from "@/lib/manilaTime";
import { STAY_TYPE_DEFAULT_TIMES } from "@/lib/constants";
import { GuestReviewsMarquee } from "@/components/guest/GuestReviewsMarquee";
import { useSeasonalSkin } from "@/components/skins/SeasonalSkinProvider";
import { SeasonalAmbience } from "@/components/skins/SeasonalAmbience";
import { SeasonalSpotlight } from "@/components/skins/SeasonalSpotlight";
import { cn } from "@/lib/utils";
// Type-only — never bundled into this client component (see the
// client-component-importing-server-only-module lesson: feedbackService.ts
// itself imports next/cache, which must stay server-only).
import type { PublicReview, PublicReviewSummary } from "@/lib/bookingEngine/feedbackService";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-fraunces" });

type Unit = { id: string; name: string; shortName: string; unitNumber: string; location: string; nightlyRate: number; photoUrl: string | null; rating: number };
type Amenity = { icon: string; label: string };

/**
 * Lightweight, dependency-free 3D tilt — perspective + rotateX/rotateY driven
 * by pointer position within the element, the same interaction Apple's
 * product pages use for hero imagery. No 3D library needed for this: it's a
 * handful of CSS transforms recalculated on mousemove.
 */
function useTilt(maxDeg = 8) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  function onMouseMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * maxDeg * 2;
    const rotateX = (0.5 - py) * maxDeg * 2;
    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03,1.03,1.03)`,
      transition: "transform 0.06s linear",
    });
  }

  function onMouseLeave() {
    setStyle({
      transform: "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
      transition: "transform 0.5s cubic-bezier(.16,1,.3,1)",
    });
  }

  return { ref, style, onMouseMove, onMouseLeave };
}

/** Scroll-triggered reveal (fade + rise) — IntersectionObserver, fires once. */
function Reveal({ children, delayMs = 0, className = "" }: { children: React.ReactNode; delayMs?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${visible ? "animate-fade-up" : "opacity-0"} ${className}`} style={{ animationDelay: `${delayMs}ms` }}>
      {children}
    </div>
  );
}

/**
 * Full-bleed rotating hero — real unit photos, no video generation involved
 * (this app has no image-to-video model access). Ken Burns zoom/pan per
 * photo, a slow crossfade carousel across every unit that has a photo, a
 * diagonal light-sheen sweep, and drifting dust motes. All pure CSS/JS on
 * the actual uploaded photos — nothing invented, nothing redrawn.
 *
 * A brand-new tenant with no unit photos yet (e.g. one just onboarded via
 * Platform Admin, before any listings/photos are added) previously got a
 * blank matte hero — this used to just `return null`. Now it falls back to
 * a live animated gradient built from the owner's own real primaryColor
 * (set at onboarding, never invented here), so the page still looks
 * intentional instead of broken/empty while listings are being set up.
 */
function CinematicHero({ units, primaryColor }: { units: Unit[]; primaryColor?: string | null }) {
  const skin = useSeasonalSkin();
  const photos = units.filter((u): u is Unit & { photoUrl: string } => !!u.photoUrl);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), 5000);
    return () => clearInterval(id);
  }, [photos.length]);

  const hasPhotos = photos.length > 0;
  const current = hasPhotos ? photos[index] : null;

  return (
    <div className="absolute inset-0">
      {hasPhotos ? (
        photos.map((u, i) => (
          <div key={u.id} className={`absolute inset-0 transition-opacity duration-[1800ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u.photoUrl}
              alt={u.name}
              className="h-full w-full origin-center object-cover animate-ken-burns"
              style={{ animationPlayState: i === index ? "running" : "paused" }}
            />
          </div>
        ))
      ) : (
        <div
          className="absolute inset-0 animate-ken-burns"
          style={{
            background: `radial-gradient(120% 90% at 20% 15%, ${primaryColor || "#8a6a3a"}55 0%, transparent 55%), linear-gradient(135deg, ${primaryColor || "var(--bronze)"} 0%, var(--matte) 70%)`,
          }}
        />
      )}

      {/* Matte-black/bronze scrim for legible cream text over any photo. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(21,18,14,.94)_0%,rgba(21,18,14,.72)_38%,rgba(21,18,14,.35)_65%,rgba(21,18,14,.55)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_120%,rgba(0,0,0,.55),transparent_60%)]" />
      {/* Seasonal color wash — soft-light blend keeps the real photo fully
          legible while giving the hero an unmistakable seasonal cast
          (e.g. green/red for Christmas). Absent for the default skin, so
          Evangelina Violet's hero stays byte-identical to before. */}
      {skin.id !== "evangelina" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${skin.colors.primary}59 0%, transparent 45%, ${skin.colors.secondary}4D 100%)`,
            mixBlendMode: "soft-light",
          }}
        />
      )}
      {/* Diagonal gold light sheen sweeping across the frame. */}
      <div className="pointer-events-none absolute inset-0 animate-sheen bg-[length:250%_250%] bg-[linear-gradient(115deg,transparent_42%,rgba(232,207,148,.14)_50%,transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="absolute animate-dust rounded-full bg-[var(--gold-light-70)]"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${10 + ((i * 53) % 80)}%`,
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${6 + (i % 5)}s`,
            }}
          />
        ))}
      </div>

      {current && (
        <div className="absolute bottom-6 right-6 hidden items-center gap-2 rounded-full bg-black/40 px-4 py-2 backdrop-blur-md sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
          <span className="text-[12px] font-semibold text-[var(--cream)]">{formatUnitDisplay(current.unitNumber, current.shortName)}</span>
        </div>
      )}
    </div>
  );
}

/** One column of the dark info strip below the hero — real property facts (default stay hours, address, support line), never placeholder copy. */
// "Five Stays..." was hardcoded regardless of the real unit count — only
// ever correct by coincidence for Evangelina's own 5 units, and visibly
// wrong (or, worse, misleading) for any other owner. Spelled out for a
// small, real range; falls back to a count-agnostic phrase past that
// rather than ever printing "0 Stays" or a wall of "Twenty-Three Stays".
const UNIT_COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function unitsHeadline(count: number): string {
  if (count === 0) return "Distinctive Stays, Each With Its Own Character";
  if (count < UNIT_COUNT_WORDS.length) return `${UNIT_COUNT_WORDS[count]} Stay${count === 1 ? "" : "s"}, Each With Its Own Character`;
  return "Every Stay Has Its Own Character";
}

function InfoBarItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-4 text-center sm:py-6">
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--gold)]" aria-hidden="true" />
      <div className="text-left">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--gold-light)]">{label}</div>
        <div className="text-[13.5px] font-semibold text-[var(--cream-75)]">{value}</div>
      </div>
    </div>
  );
}

/**
 * Booking module's landing header — hero + date search + listings grid.
 * Deliberately Booking-only content (unit selection, date selection): the
 * Guest Experience Digital Guidebook preview that used to live below this
 * on the old homepage has moved to "/" (see GuideHubView) and is not
 * reproduced here, keeping the two modules independent per the Guest
 * Experience Module spec.
 */
export function ListingsGrid({
  units,
  availabilityToday,
  amenities,
  address,
  contactPhone,
  reviews,
  reviewSummary,
  ownerSlug,
  businessName,
  logoUrl,
  primaryColor,
}: {
  units: Unit[];
  availabilityToday?: Record<string, boolean>;
  amenities?: Amenity[];
  address?: string;
  contactPhone?: string | null;
  reviews?: PublicReview[];
  reviewSummary?: PublicReviewSummary;
  ownerSlug?: string;
  businessName?: string;
  // Real per-owner branding (Owner.logoUrl/primaryColor, set during
  // onboarding/Platform Admin) — undefined for /book, which keeps
  // Evangelina's page byte-identical to before this was added.
  logoUrl?: string | null;
  primaryColor?: string | null;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const today = manilaTodayISO();
  const startingRate = units.length ? Math.min(...units.map((u) => u.nightlyRate)) : null;
  const fullStay = STAY_TYPE_DEFAULT_TIMES.Full;
  // Marketing is the highest-intensity skin surface (brief's "Staff
  // Experience" table) — eyebrow/headline/subtext/CTA copy and the CTA's
  // color come from the active skin, real unit photos and the search
  // form/booking flow underneath are completely untouched either way.
  const skin = useSeasonalSkin();

  function search(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    // scroll: false — Next's router otherwise resets scroll to the top of
    // the page on every push, which would fight (and always win over) the
    // manual scrollIntoView below.
    const bookBase = ownerSlug ? `/o/${ownerSlug}/book` : "/book";
    router.push(`${bookBase}${params.toString() ? `?${params}` : ""}`, { scroll: false });
    // The booking flow further down the same page re-syncs from these
    // params and searches automatically (see BookFlowView) — but that
    // happens off-screen unless we bring it into view ourselves.
    requestAnimationFrame(() => {
      document.getElementById("book-flow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className={`book-luxury overflow-hidden ${fraunces.variable}`}>
      <div className="relative min-h-[640px] overflow-hidden bg-[var(--matte)] px-4 py-20 sm:px-6 sm:py-28">
        <CinematicHero units={units} primaryColor={primaryColor} />
        {/* Marketing is the highest-intensity skin surface — a full
            floating-decoration layer on top of the photo, behind the
            headline (see SeasonalAmbience). */}
        <SeasonalAmbience count={22} />

        <div className="relative mx-auto max-w-[720px] text-center">
          {logoUrl && (
            <Reveal>
              <div className="mx-auto mb-6 h-16 w-16 overflow-hidden rounded-full border border-white/25 bg-white/10 shadow-[0_8px_24px_rgba(0,0,0,.35)] backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={businessName ? `${businessName} logo` : "Logo"} className="h-full w-full object-cover" />
              </div>
            </Reveal>
          )}
          <Reveal>
            {/* Default skin keeps the exact existing gold classes (no visual
                change); a seasonal skin swaps in its own accent color via
                inline style instead of the fixed gold tokens. */}
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border bg-black/30 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] backdrop-blur-sm",
                skin.id === "evangelina" ? "border-[var(--gold-40)] text-[var(--gold-light)]" : undefined
              )}
              style={skin.id === "evangelina" ? undefined : { borderColor: `${skin.colors.secondary}66`, color: skin.colors.secondary }}
            >
              {skin.messaging.marketingEyebrow}
            </span>
          </Reveal>
          <Reveal delayMs={80}>
            <h1
              style={{ fontFamily: "var(--font-fraunces)" }}
              className="mt-5 text-[38px] font-medium italic leading-[1.12] text-[var(--cream)] text-balance sm:text-[54px]"
            >
              {skin.messaging.marketingHeadline}
            </h1>
          </Reveal>
          <Reveal delayMs={160}>
            <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-relaxed text-[var(--cream-75)]">
              {skin.messaging.marketingSubtext}
              {startingRate != null && (
                <> — starting at only <span className="font-bold text-[var(--gold-light)]">{peso(startingRate)}</span></>
              )}
              .
            </p>
          </Reveal>

          <Reveal delayMs={240}>
            <form
              onSubmit={search}
              className="mx-auto mt-9 max-w-[560px] space-y-3 rounded-[20px] border border-white/15 bg-white/10 p-4 text-left shadow-[0_25px_60px_rgba(0,0,0,.45)] backdrop-blur-2xl"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="home-checkin" className="text-[11px] font-bold uppercase tracking-wide text-[var(--cream-70)]">Check-in</label>
                  <input
                    id="home-checkin" type="date" required min={today} value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/20 bg-black/25 px-3.5 py-3 text-sm text-[var(--cream)] outline-none transition [color-scheme:dark] focus:border-[var(--gold)] focus:ring-4 focus:ring-[var(--gold-20)]"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="home-checkout" className="text-[11px] font-bold uppercase tracking-wide text-[var(--cream-70)]">Check-out</label>
                  <input
                    id="home-checkout" type="date" required min={checkIn || undefined} value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/20 bg-black/25 px-3.5 py-3 text-sm text-[var(--cream)] outline-none transition [color-scheme:dark] focus:border-[var(--gold)] focus:ring-4 focus:ring-[var(--gold-20)]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className={cn(
                  "w-full rounded-xl py-3.5 text-sm font-bold text-[var(--matte)] shadow-[0_10px_28px_rgba(201,162,75,.35)] transition hover:brightness-105 active:scale-[.99]",
                  skin.id === "evangelina" && "bg-gradient-to-r from-[var(--gold)] to-[var(--gold-light)]"
                )}
                style={skin.id === "evangelina" ? undefined : { backgroundImage: `linear-gradient(to right, ${skin.colors.secondary}, ${skin.colors.accent})` }}
              >
                {skin.messaging.marketingCta}
              </button>
            </form>
          </Reveal>
        </div>
      </div>

      <div className="border-b border-[var(--gold-40)] bg-[var(--matte-2)]">
        <div className="mx-auto grid max-w-[1000px] grid-cols-1 divide-y divide-[var(--gold-40)] px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
          <InfoBarItem
            label="Check-in / Check-out"
            value={`${fmtTimeStr(fullStay.checkInTime)} / ${fmtTimeStr(fullStay.checkOutTime)}`}
          />
          {address && <InfoBarItem label="Location" value={address} />}
          {contactPhone && <InfoBarItem label="Guest Support" value={contactPhone} />}
        </div>
      </div>

      <SeasonalSpotlight />

      <div id="listings" className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 sm:py-16">
        <Reveal className="mb-8 text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--bronze)]">Our Units</span>
          <h2 style={{ fontFamily: "var(--font-fraunces)" }} className="mt-2 text-[28px] font-medium text-[var(--ink)] sm:text-[32px]">
            {unitsHeadline(units.length)}
          </h2>
        </Reveal>
        {units.length === 0 ? (
          <div className="card mx-auto max-w-[460px] p-10 text-center">
            <div
              className="mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl"
              style={{ background: `${primaryColor || "var(--bronze)"}1A`, color: primaryColor || "var(--bronze)" }}
              aria-hidden="true"
            >
              🏡
            </div>
            <p className="mt-4 text-[14.5px] font-semibold text-[var(--ink)]">Listings are being set up</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--gray)]">
              {businessName ?? "This host"} is getting their stays ready — please check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((u, i) => (
              <Reveal key={u.id} delayMs={(i % 3) * 90}>
                <ListingCard unit={u} available={availabilityToday?.[u.id]} amenities={amenities} ownerSlug={ownerSlug} />
              </Reveal>
            ))}
          </div>
        )}
      </div>

      <GuestReviewsMarquee reviews={reviews ?? []} summary={reviewSummary ?? { averageRating: 0, count: 0 }} businessName={businessName} />
    </div>
  );
}

function ListingCard({ unit: u, available, amenities, ownerSlug }: { unit: Unit; available?: boolean; amenities?: Amenity[]; ownerSlug?: string }) {
  const { ref, style, onMouseMove, onMouseLeave } = useTilt(4);
  const href = ownerSlug ? `/listing/${u.id}?owner=${ownerSlug}` : `/listing/${u.id}`;
  return (
    <Link href={href} className="group block">
      <div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={style}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-[var(--bg-2)] shadow-s transition-shadow will-change-transform group-hover:shadow-[0_24px_50px_rgba(21,18,14,.28)]"
      >
        {u.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.photoUrl} alt={u.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl">🏠</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />

        {available !== undefined && (
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold backdrop-blur-md ${
              available ? "bg-[var(--gold-90)] text-[var(--matte)]" : "bg-black/55 text-white/80"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-[var(--matte)]" : "bg-white/70"}`} />
            {available ? "Available Today" : "Booked Today"}
          </span>
        )}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md">
          ★ {u.rating.toFixed(2)}
        </span>

        <div className="absolute inset-x-3 bottom-3">
          <div className="truncate text-[15px] font-bold text-white">{formatUnitDisplay(u.unitNumber, u.shortName)}</div>
          <div className="truncate text-[12px] text-white/75">{u.location}</div>
        </div>
      </div>

      {amenities && amenities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {amenities.map((a) => (
            <span key={a.label} title={a.label} className="inline-flex items-center gap-1 text-[12px] text-[var(--gray)]">
              <span aria-hidden="true">{a.icon}</span>
              <span className="hidden sm:inline">{a.label.split(" ").slice(0, 2).join(" ")}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-[15px]">
          <span className="font-extrabold text-[var(--ink)]">{peso(u.nightlyRate)}</span>{" "}
          <span className="text-[var(--gray)]">/ night</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--matte)] px-3.5 py-1.5 text-[12.5px] font-bold text-[var(--gold-light)] transition group-hover:bg-[var(--bronze)]">
          Book Now →
        </span>
      </div>
    </Link>
  );
}
