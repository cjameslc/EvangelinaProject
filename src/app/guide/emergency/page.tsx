import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CATEGORY_COVER_PHOTOS } from "@/lib/guideNav";
import { telUrl, PH_NATIONAL_EMERGENCY_HOTLINE } from "@/lib/guideUtils";

export default async function EmergencyPage() {
  const g = await getGuidebookSettings();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="🚨" image={CATEGORY_COVER_PHOTOS.emergency} title="Emergency" subtitle="Help when you need it." />

      <div className="card mt-3 p-5">
        <a href={telUrl(PH_NATIONAL_EMERGENCY_HOTLINE)} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3 transition hover:bg-[var(--bg-2)]">
          <div>
            <div className="text-[11px] font-bold text-[var(--gray)]">National emergency hotline</div>
            <div className="text-[16px] font-extrabold">{PH_NATIONAL_EMERGENCY_HOTLINE}</div>
          </div>
          <span className="text-[20px]">📞</span>
        </a>
      </div>

      {g.emergencyContacts.length > 0 && (
        <div className="card mt-3 divide-y divide-[var(--line)] p-0">
          {g.emergencyContacts.map((c) => (
            <div key={c.name} className="p-4">
              <div className="text-[11px] font-bold text-[var(--gray)]">{c.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {c.phones.map((phone) => (
                  <a key={phone} href={telUrl(phone)} className="btn btn-sm">📞 {phone}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {g.emergencyContactPhone && (
        <div className="card mt-3 p-5">
          <a href={telUrl(g.emergencyContactPhone)} className="btn w-full justify-center text-rausch">🏠 Property emergency contact</a>
        </div>
      )}
    </div>
  );
}
