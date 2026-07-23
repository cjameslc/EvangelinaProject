import { getGuidebookSettings } from "@/lib/guidebookService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { CATEGORY_ART } from "@/lib/guideNav";
import { FaqAccordion } from "@/components/guest/FaqAccordion";

export default async function FaqsPage() {
  const g = await getGuidebookSettings();

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader icon="❓" art={CATEGORY_ART.faqs} title="FAQs" subtitle="Common questions from guests." />

      <div className="mt-3">
        {g.faqs.length === 0 ? (
          <div className="card p-6 text-center text-[13.5px] text-[var(--gray)]">No FAQs have been added yet.</div>
        ) : (
          <FaqAccordion faqs={g.faqs} />
        )}
      </div>
    </div>
  );
}
