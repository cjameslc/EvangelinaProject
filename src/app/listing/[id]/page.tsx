import { notFound } from "next/navigation";
import Link from "next/link";
import { peso, formatUnitDisplay } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function ListingPage({ params, searchParams }: { params: { id: string }; searchParams: { owner?: string } }) {
  // Fetched directly by id rather than filtered out of
  // getCachedActiveUnits() (which is scoped to a single owner) — a unit's
  // id is globally unique regardless of which owner it belongs to, so this
  // works for any owner's listing without needing an /o/[ownerSlug] variant
  // of this page. ownerSlug (searchParams.owner, carried from ListingsGrid's
  // link when present) only affects the "Check availability" link below.
  const unit = await prisma.unit.findUnique({
    where: { id: params.id, active: true },
    select: { id: true, name: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
  });
  if (!unit) notFound();
  const bookHref = searchParams.owner ? `/o/${searchParams.owner}/book?unit=${unit.id}` : `/book?unit=${unit.id}`;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-9 sm:px-6">
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-[var(--bg-2)]">
        {unit.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={unit.photoUrl} alt={unit.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-6xl">🏠</div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">{formatUnitDisplay(unit.unitNumber, unit.name)}</h1>
          <p className="mt-1 text-[14px] text-[var(--gray)]">{unit.location}</p>
        </div>
        <div className="flex items-center gap-1 text-[15px] font-bold">★ {unit.rating.toFixed(1)}</div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["Daycation", "Night", "Full"] as const).map((st) => (
          <div key={st} className="card p-4">
            <div className="text-[12px] font-bold text-[var(--gray)]">{STAY_TYPES[st].label}</div>
            <div className="mt-1 text-[13px] text-[var(--gray)]">{STAY_TYPES[st].hrs}</div>
          </div>
        ))}
      </div>

      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[22px] font-extrabold">{peso(unit.nightlyRate)}</div>
          <div className="text-[13px] text-[var(--gray)]">starting rate / night</div>
        </div>
        <Link href={bookHref} className="btn-primary">Check availability</Link>
      </div>
    </div>
  );
}
