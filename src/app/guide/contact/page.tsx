import { getGuidebookSettingsForCurrentGuest } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CATEGORY_COVER_PHOTOS } from "@/lib/guideNav";
import { telUrl, messengerUrl } from "@/lib/guideUtils";

export default async function ContactPage() {
  const g = await getGuidebookSettingsForCurrentGuest();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="📞" image={CATEGORY_COVER_PHOTOS.contact} title="Contact Host" subtitle={g.hostName ? `Reach ${g.hostName} directly.` : "Get in touch with your host."} />

      <div className="card mt-3 space-y-2.5 p-5">
        {g.contactPhone ? (
          <a href={telUrl(g.contactPhone)} className="btn-primary w-full justify-center">📞 Call {g.contactPhone}</a>
        ) : (
          <p className="text-center text-[13.5px] text-[var(--gray)]">No contact number has been set yet.</p>
        )}
        {g.messengerUsername && (
          <a href={messengerUrl(g.messengerUsername)} target="_blank" rel="noopener noreferrer" className="btn w-full justify-center">💬 Message us</a>
        )}
      </div>

      {g.staffContacts.length > 0 && (
        <div className="card mt-3 divide-y divide-[var(--line)] p-0">
          {g.staffContacts.map((c) => (
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
    </div>
  );
}
