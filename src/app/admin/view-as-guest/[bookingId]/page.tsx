import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { guideBookingSelect } from "@/lib/bookingEngine/guestService";
import { getGuidebookSettings } from "@/lib/guidebookService";
import { getPlaceInsightsByNames } from "@/lib/places/placeInsightService";
import { getCategoryImages } from "@/lib/unsplash/service";
import { pickStable } from "@/lib/unsplash/pick";
import { GuestBookingHub } from "@/components/guest/GuestBookingHub";

/**
 * OWNER_ADMIN-only QA tool — renders the exact same GuestBookingHub a real
 * guest sees for a chosen booking, without needing a guest session or
 * touching the real guest-login flow. Not guestId-scoped (staff isn't
 * "logged in as" anyone) — fetches the booking directly by id, same
 * guideBookingSelect shape the real guest page uses, so every child
 * component (GuidebookView, BookingDetailClient, SecureDoorCodeCard,
 * SecureWifiCard) renders identically. Door code/WiFi password are
 * stripped to booleans here too, same as the real page — SecureDoorCodeCard/
 * SecureWifiCard fetch the real values themselves via the OWNER_ADMIN
 * QA-preview path those two routes accept (see their own comments).
 */
export default async function ViewAsGuestPage({ params }: { params: { bookingId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER_ADMIN") redirect("/");

  const [booking, guidebook, heroImages] = await Promise.all([
    prisma.booking.findUnique({ where: { id: params.bookingId }, select: guideBookingSelect }),
    getGuidebookSettings(),
    getCategoryImages("hero"),
  ]);
  if (!booking) notFound();

  const insightRows = await getPlaceInsightsByNames(guidebook.categories.flatMap((c) => c.items));
  const placeInsights = Object.fromEntries(insightRows);
  const heroImage = pickStable(heroImages, booking.id);

  const sanitizedBooking = {
    ...booking,
    unit: {
      ...booking.unit,
      doorCode: null,
      hasDoorCode: !!booking.unit.doorCode,
      wifiSsid: null,
      wifiPassword: null,
      hasWifi: !!(booking.unit.wifiSsid && booking.unit.wifiPassword),
    },
  };

  return (
    <div>
      <div className="sticky top-0 z-40 bg-[var(--ink)] px-4 py-2 text-center text-[12.5px] font-bold text-white">
        🔍 Viewing as Guest — {(Array.isArray(booking.guests) ? booking.guests[0] : null) ?? "Guest"}&rsquo;s booking ({booking.confirmationNumber ?? booking.id.slice(0, 8)})
        <Link href="/bookings" className="ml-3 underline">Exit</Link>
      </div>
      <GuestBookingHub
        booking={JSON.parse(JSON.stringify(sanitizedBooking))}
        guidebook={{ ...guidebook, placeInsights: JSON.parse(JSON.stringify(placeInsights)), heroImage }}
      />
    </div>
  );
}
