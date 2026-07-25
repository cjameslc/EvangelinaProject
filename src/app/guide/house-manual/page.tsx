import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { HouseRulesSection, InsideTheBuildingSection } from "@/components/guest/GuidebookSections";
import { peso } from "@/lib/format";
import { getCategoryImages } from "@/lib/unsplash/service";
import { pickStable } from "@/lib/unsplash/pick";

export default async function HouseManualPage() {
  const [g, houseRulesImages] = await Promise.all([getGuidebookSettings(), getCategoryImages("house-rules")]);
  const headerImage = pickStable(houseRulesImages, "house-manual");

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="📖" unsplashImage={headerImage} title="House Manual" subtitle="Rates, parking, house rules, and building facilities — everything about staying here." />

      {/* Rates */}
      <div id="rates" className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">💰 Rates</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">Weekday · 12 hrs</div>
            <div className="mt-0.5 text-[18px] font-extrabold">{peso(g.weekdayRate12h)}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">Weekday · 21 hrs</div>
            <div className="mt-0.5 text-[18px] font-extrabold">{peso(g.weekdayRate21h)}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">Weekend · 12 hrs</div>
            <div className="mt-0.5 text-[18px] font-extrabold">{peso(g.weekendRate12h)}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">Weekend · 21 hrs</div>
            <div className="mt-0.5 text-[18px] font-extrabold">{peso(g.weekendRate21h)}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[13px] text-[var(--gray)]">
          <p>🎉 <span className="font-bold text-[var(--fg)]">{g.weekdayNightPromoPct}% off</span> weekday night stays.</p>
          <p>⏱️ Extension: {peso(g.extensionFeePerHour)}/hour</p>
          <p>🕐 Flexible time: {peso(g.flexibleTimeFee)}</p>
          <p>💵 Reservation fee: {peso(g.dpFee)} (deducted from your total — no separate security deposit)</p>
        </div>
      </div>

      {/* Parking */}
      <div id="parking" className="card mt-3 p-5">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🚗 Parking</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">🚗 Car</div>
            <div className="mt-0.5 text-[16px] font-extrabold">{peso(g.parkingCarRate)}</div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-3">
            <div className="text-[11px] font-bold text-[var(--gray)]">🏍️ Motorcycle</div>
            <div className="mt-0.5 text-[16px] font-extrabold">{peso(g.parkingMotorcycleRate)}</div>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--gray)]">Parking is paid and requires advance reservation.</p>
      </div>

      {/* Celebration package */}
      {g.celebrationPackageItems.length > 0 && (
        <div id="celebration" className="card mt-3 p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">🎈 Celebration Package</div>
            <div className="text-[15px] font-extrabold text-rausch">{peso(g.celebrationPackagePrice)}</div>
          </div>
          <ul className="mt-2 space-y-1 text-[13.5px]">
            {g.celebrationPackageItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-rausch">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* House rules */}
      <div id="house-rules" className="mt-3">
        <HouseRulesSection houseRules={g.houseRules} />
      </div>

      {/* Building facilities */}
      <div id="building" className="mt-3">
        <InsideTheBuildingSection />
      </div>
    </div>
  );
}
