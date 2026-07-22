"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { peso } from "@/lib/format";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; location: string; nightlyRate: number; photoUrl: string | null; rating: number };

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
 * "Fake cinematic" hero visual — real unit photos, no video generation
 * involved (this app has no image-to-video model access). Ken Burns
 * zoom/pan per photo, a slow crossfade carousel across every unit that has
 * a photo, a diagonal light-sheen sweep, a handful of drifting particles,
 * and the same pointer-tilt used on the listing cards below. All pure
 * CSS/JS on the actual uploaded photos — nothing invented, nothing redrawn.
 */
function CinematicHero({ units }: { units: Unit[] }) {
  const photos = units.filter((u): u is Unit & { photoUrl: string } => !!u.photoUrl);
  const [index, setIndex] = useState(0);
  const { ref, style, onMouseMove, onMouseLeave } = useTilt(5);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), 6000);
    return () => clearInterval(id);
  }, [photos.length]);

  if (photos.length === 0) return null;
  const current = photos[index];

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={style}
      className="relative mx-auto hidden aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-[32px] bg-[var(--bg-2)] shadow-[0_30px_70px_rgba(0,0,0,.3)] will-change-transform [perspective:1200px] lg:block"
    >
      {photos.map((u, i) => (
        <div key={u.id} className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${i === index ? "opacity-100" : "opacity-0"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u.photoUrl}
            alt={u.name}
            className="h-full w-full origin-center object-cover animate-ken-burns"
            style={{ animationPlayState: i === index ? "running" : "paused" }}
          />
        </div>
      ))}

      {/* Vignette for legibility under the caption. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_100%,rgba(0,0,0,.4),transparent_55%)]" />
      {/* Diagonal light sheen sweeping across the frame. */}
      <div className="pointer-events-none absolute inset-0 animate-sheen bg-[length:250%_250%] bg-[linear-gradient(115deg,transparent_42%,rgba(255,255,255,.22)_50%,transparent_58%)]" />
      {/* Drifting dust motes, lit by the "sunlight." */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute animate-dust rounded-full bg-white/80"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${20 + ((i * 53) % 70)}%`,
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              animationDelay: `${i * 0.55}s`,
              animationDuration: `${6 + (i % 5)}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/35 px-4 py-2.5 backdrop-blur-md">
        <div className="text-[13px] font-bold text-white">{current.shortName}</div>
        <div className="text-[11px] text-white/80">{current.location}</div>
      </div>
    </div>
  );
}

export function GuestHomeView({ units }: { units: Unit[] }) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  function search(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    router.push(`/book${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="overflow-hidden">
      <div className="relative border-b border-[var(--line)] bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(255,56,92,.10),transparent_60%)] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div className="text-center lg:text-left">
            <h1 className="animate-fade-up mx-auto max-w-[620px] text-[36px] font-extrabold leading-[1.08] tracking-tight sm:text-[48px] lg:mx-0">
              Escape the Ordinary in the Heart of <span className="bg-gradient-to-r from-rausch to-[#ff7a5c] bg-clip-text text-transparent">Cubao</span>
            </h1>
            <p
              className="animate-fade-up mx-auto mt-4 max-w-[520px] text-[15.5px] leading-relaxed text-[var(--gray)] lg:mx-0"
              style={{ animationDelay: "120ms" }}
            >
              Discover 5 thoughtfully designed staycation units in Araneta City, available for 12-hour day stays, overnight escapes, or a relaxing 21-hour retreat. Comfort, convenience, and exceptional value—all in one place.
            </p>

            <form
              onSubmit={search}
              className="animate-fade-up card mx-auto mt-8 max-w-[560px] space-y-3 border-white/40 bg-[var(--card)]/80 p-4 text-left shadow-[0_20px_50px_rgba(0,0,0,.12)] backdrop-blur-xl lg:mx-0"
              style={{ animationDelay: "220ms" }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="home-checkin" className="field-label">Check-in</label>
                  <input id="home-checkin" type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="field-input mt-1 w-full" />
                </div>
                <div className="min-w-0">
                  <label htmlFor="home-checkout" className="field-label">Check-out</label>
                  <input id="home-checkout" type="date" required min={checkIn || undefined} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="field-input mt-1 w-full" />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Search</button>
            </form>
          </div>

          <CinematicHero units={units} />
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <h2 className="mb-5 text-[20px] font-extrabold tracking-tight">Our listings</h2>
        {units.length === 0 ? (
          <div className="card p-8 text-center text-[14px] text-[var(--gray)]">
            No listings are available right now — please check back soon.
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u, i) => (
            <Reveal key={u.id} delayMs={(i % 3) * 90}>
              <ListingCard unit={u} />
            </Reveal>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

function ListingCard({ unit: u }: { unit: Unit }) {
  const { ref, style, onMouseMove, onMouseLeave } = useTilt(5);
  return (
    <Link href={`/listing/${u.id}`} className="group block">
      <div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={style}
        className="aspect-square w-full overflow-hidden rounded-2xl bg-[var(--bg-2)] shadow-s transition-shadow will-change-transform group-hover:shadow-[0_20px_45px_rgba(0,0,0,.22)]"
      >
        {u.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.photoUrl} alt={u.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl">🏠</div>
        )}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-extrabold">{u.shortName}</div>
          <div className="truncate text-[13px] text-[var(--gray)]">{u.location}</div>
        </div>
        <div className="flex flex-none items-center gap-1 text-[13px] font-bold">★ {u.rating.toFixed(1)}</div>
      </div>
      <div className="mt-1 text-[14px]"><span className="font-extrabold">{peso(u.nightlyRate)}</span> <span className="text-[var(--gray)]">/ night</span></div>
    </Link>
  );
}
