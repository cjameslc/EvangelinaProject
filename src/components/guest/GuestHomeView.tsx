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

function TiltPhoto({ url, alt, className, rotate, float }: { url: string | null; alt: string; className: string; rotate: number; float: number }) {
  const { ref, style, onMouseMove, onMouseLeave } = useTilt(6);
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`animate-float overflow-hidden rounded-[28px] bg-[var(--bg-2)] shadow-[0_20px_50px_rgba(0,0,0,.25)] will-change-transform ${className}`}
      style={{ ...style, transform: `${style.transform ?? ""} rotate(${rotate}deg)`, animationDuration: `${float}s`, animationDelay: `${rotate * 40}ms` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-4xl">🏠</div>
      )}
    </div>
  );
}

export function GuestHomeView({ units }: { units: Unit[] }) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const heroPhotos = units.slice(0, 3);

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

          {/* Floating 3D photo stack — Apple product-page depth, tilts toward the pointer. */}
          <div className="relative mx-auto hidden h-[380px] w-full max-w-[420px] [perspective:1200px] lg:block">
            <TiltPhoto url={heroPhotos[0]?.photoUrl ?? null} alt={heroPhotos[0]?.name ?? "Unit"} className="absolute left-2 top-10 h-[260px] w-[220px] -rotate-6" rotate={-6} float={3.2} />
            <TiltPhoto url={heroPhotos[1]?.photoUrl ?? null} alt={heroPhotos[1]?.name ?? "Unit"} className="absolute left-[150px] top-0 h-[300px] w-[240px] rotate-3 z-10" rotate={3} float={2.6} />
            <TiltPhoto url={heroPhotos[2]?.photoUrl ?? null} alt={heroPhotos[2]?.name ?? "Unit"} className="absolute left-[190px] top-[190px] h-[200px] w-[180px] rotate-[10deg]" rotate={10} float={3.8} />
          </div>
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
