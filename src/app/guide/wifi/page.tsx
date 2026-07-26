import { getCurrentGuest } from "@/lib/guestSession";
import { getActiveGuideBooking } from "@/lib/bookingEngine/guestService";
import { GuidePageHeader } from "@/components/guest/GuidePageHeader";
import { SecureWifiCard, NoActiveStayNotice } from "@/components/guest/SecureGuideCards";
import { GALLERY } from "@/lib/galleryContent";
import { formatUnitDisplay } from "@/lib/format";

export default async function WifiPage() {
  const guest = await getCurrentGuest();
  const booking = guest ? await getActiveGuideBooking(guest.id) : null;
  const hasWifi = !!(booking?.unit.wifiSsid && booking.unit.wifiPassword);

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 sm:px-6">
      <GuidePageHeader
        image={GALLERY.wifi[0].src}
        icon="📶"
        title="WiFi"
        subtitle={hasWifi ? `Connect your devices in ${formatUnitDisplay(booking!.unit.unitNumber, booking!.unit.name)}.` : "Every unit has its own free WiFi network."}
      />

      <div className="card mt-3 p-5">
        {hasWifi ? (
          <SecureWifiCard />
        ) : (
          <NoActiveStayNotice what="the WiFi network name and password" signedIn={!!guest} />
        )}
      </div>
    </div>
  );
}
