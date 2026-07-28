import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeSocialMedia } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitIdWhere, unitWhere } from "@/lib/session";
import { SocialMediaView } from "@/components/social/SocialMediaView";

export default async function SocialMediaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeSocialMedia(user.role)) redirect("/");

  const [units, bookings, settings] = await Promise.all([
    prisma.unit.findMany({ where: unitIdWhere(user), orderBy: { sortOrder: "asc" }, select: { id: true, name: true, unitNumber: true, shortName: true, photoUrl: true, nightlyRate: true } }),
    // Lean select, no date bound — month navigation happens client-side
    // (same pattern as the Bookings Schedule grid) rather than refetching
    // on every prev/next click. At this property's real scale (a few
    // hundred bookings, no image/blob fields) this is small. checkInTime/
    // checkOutTime included — the real per-stay-type opportunity calc
    // (socialOpportunity.ts) needs them for Flexible-type overlap checks,
    // same fields the live booking-conflict check itself reads.
    prisma.booking.findMany({
      where: { ...unitWhere(user), cancelledAt: null },
      select: { unitId: true, date: true, checkOutDate: true, stayType: true, checkInTime: true, checkOutTime: true },
    }),
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
  ]);

  return (
    <SocialMediaView
      units={JSON.parse(JSON.stringify(units))}
      bookings={JSON.parse(JSON.stringify(bookings))}
      businessName={settings.businessName}
      location={settings.address}
      contactPhone={settings.contactPhone}
      messengerUsername={settings.messengerUsername}
      rates={{
        weekdayRate12h: settings.weekdayRate12h,
        weekdayRate21h: settings.weekdayRate21h,
        weekendRate12h: settings.weekendRate12h,
        weekendRate21h: settings.weekendRate21h,
        weekdayNightPromoPct: settings.weekdayNightPromoPct,
      }}
      dpFee={settings.dpFee}
      amenities={(settings.amenities as string[] | null) ?? []}
    />
  );
}
