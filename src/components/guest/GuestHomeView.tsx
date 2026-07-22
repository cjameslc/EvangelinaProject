"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { peso } from "@/lib/format";

type Unit = { id: string; name: string; shortName: string; unitNumber: string; location: string; nightlyRate: number; photoUrl: string | null; rating: number };

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
    <div>
      <div className="border-b border-[var(--line)] bg-gradient-to-b from-rausch/5 to-transparent px-4 py-14 text-center sm:px-6">
        <h1 className="mx-auto max-w-[600px] text-[32px] font-extrabold tracking-tight sm:text-[40px]">
          Your staycation in Cubao, starts here
        </h1>
        <p className="mx-auto mt-3 max-w-[480px] text-[15px] text-[var(--gray)]">
          5 handpicked units in Araneta City — Daycation, overnight, or a full 21-hour stay.
        </p>

        <form onSubmit={search} className="card mx-auto mt-8 max-w-[560px] space-y-3 p-4 text-left">
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

      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <h2 className="mb-5 text-[20px] font-extrabold tracking-tight">Our listings</h2>
        {units.length === 0 ? (
          <div className="card p-8 text-center text-[14px] text-[var(--gray)]">
            No listings are available right now — please check back soon.
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
            <Link key={u.id} href={`/listing/${u.id}`} className="group block">
              <div className="aspect-square w-full overflow-hidden rounded-2xl bg-[var(--bg-2)]">
                {u.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photoUrl} alt={u.name} className="h-full w-full object-cover transition group-hover:scale-105" />
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
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
