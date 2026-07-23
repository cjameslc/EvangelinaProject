import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { InsideTheBuildingSection } from "@/components/guest/GuidebookSections";
import { mapsSearchUrl, wazeUrl, GRAB_URL } from "@/lib/guideUtils";
import { GALLERY } from "@/lib/galleryContent";

const PLACE = "Urban Deca Towers Cubao";
const CONTEXT = "Cubao, Quezon City";

export default function LocationPage() {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader image={GALLERY.building[0].src} icon="📍" title="Location" subtitle={`${PLACE}, ${CONTEXT} — Main Lobby faces EDSA.`} />

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <a href={mapsSearchUrl(PLACE, CONTEXT)} target="_blank" rel="noopener noreferrer" className="card flex flex-col items-center gap-1.5 py-3.5 text-center transition hover:bg-[var(--bg-2)]">
          <span className="text-[22px]">🗺️</span>
          <span className="text-[11px] font-bold">Maps</span>
        </a>
        <a href={wazeUrl(PLACE, CONTEXT)} target="_blank" rel="noopener noreferrer" className="card flex flex-col items-center gap-1.5 py-3.5 text-center transition hover:bg-[var(--bg-2)]">
          <span className="text-[22px]">🚗</span>
          <span className="text-[11px] font-bold">Waze</span>
        </a>
        <a href={GRAB_URL} target="_blank" rel="noopener noreferrer" className="card flex flex-col items-center gap-1.5 py-3.5 text-center transition hover:bg-[var(--bg-2)]">
          <span className="text-[22px]">🚕</span>
          <span className="text-[11px] font-bold">Grab</span>
        </a>
      </div>

      <div className="card mt-3 p-5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Getting here</div>
        <p className="text-[13.5px] leading-relaxed">
          Pin <span className="font-bold">&ldquo;{PLACE}&rdquo;</span> in Grab or JoyRide. Proceed to the <span className="font-bold">Main Lobby facing EDSA</span> — our team will meet you there.
        </p>
      </div>

      <div className="mt-3">
        <InsideTheBuildingSection />
      </div>
    </div>
  );
}
