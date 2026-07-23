import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { telUrl, messengerUrl } from "@/lib/guideUtils";

export default async function ContactPage() {
  const g = await getGuidebookSettings();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="📞" title="Contact Host" subtitle={g.hostName ? `Reach ${g.hostName} directly.` : "Get in touch with your host."} />

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
    </div>
  );
}
