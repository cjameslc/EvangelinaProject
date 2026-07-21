import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { peso } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";

export default async function ListingPage({ params }: { params: { id: string } }) {
  const unit = await prisma.unit.findUnique({
    where: { id: params.id, active: true },
    select: { id: true, name: true, shortName: true, unitNumber: true, location: true, nightlyRate: true, photoUrl: true, rating: true },
  });
  if (!unit) notFound();

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
          <h1 className="text-[24px] font-extrabold tracking-tight">{unit.name}</h1>
          <p className="mt-1 text-[14px] text-[var(--gray)]">{unit.location} · Unit {unit.unitNumber}</p>
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
        <Link href={`/book?unit=${unit.id}`} className="btn-primary">Check availability</Link>
      </div>
    </div>
  );
}
