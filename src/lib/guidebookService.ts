import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { GUIDEBOOK_CATEGORIES, AMENITIES, HOUSE_RULES, type GuidebookCategory, type Amenity } from "@/lib/guidebookContent";
import { ROLE_LABEL } from "@/lib/constants";
import { getDefaultOwnerId } from "@/lib/ownerScope";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestOwnerId } from "@/lib/bookingEngine/guestService";

export type TeamMember = { id: string; name: string; avatarUrl: string | null; avatarColor: string; role: string };
export type EmergencyContact = { name: string; phones: string[] };
export type FaqCategory = { category: string; items: { q: string; a: string }[] };

export type GuidebookSettings = {
  categories: GuidebookCategory[];
  amenities: Amenity[];
  houseRules: string[];
  contactPhone: string | null;
  emergencyContactPhone: string | null;
  messengerUsername: string | null;
  hostName: string | null;
  hostPhotoUrl: string | null;
  hostBio: string | null;
  team: TeamMember[];
  extensionFeePerHour: number;
  flexibleTimeFee: number;
  parkingCarRate: number;
  parkingMotorcycleRate: number;
  celebrationPackagePrice: number;
  celebrationPackageItems: string[];
  emergencyContacts: EmergencyContact[];
  staffContacts: EmergencyContact[];
  faqs: FaqCategory[];
  dpFee: number;
  weekdayRate12h: number;
  weekdayRate21h: number;
  weekendRate12h: number;
  weekendRate21h: number;
  weekdayNightPromoPct: number;
  propertyLat: number | null;
  propertyLng: number | null;
  // A real Vercel Blob URL (not base64), unlike hostPhotoUrl below — safe
  // to include directly in the cached core.
  paymentQrUrl: string | null;
  paymentInstructions: string | null;
};

type CachedCore = Omit<GuidebookSettings, "hostPhotoUrl" | "team"> & { team: Omit<TeamMember, "avatarUrl">[] };

/**
 * Now read on every home-page visit (see src/app/page.tsx) as well as the
 * guest booking hub, so this is cached the same way Settings/units already
 * are (60s). hostPhotoUrl and each team member's avatarUrl are base64
 * data-URL photos — deliberately kept OUT of the cached payload (same fix
 * as getRankedLeaderboard's cache in src/app/api/leaderboard/route.ts,
 * which silently failed to write and recomputed from scratch on every
 * request once real photos pushed it past Next's 2MB per-entry data-cache
 * limit) and fetched fresh, uncached, in the small merge step below
 * instead.
 */
export const getCachedGuidebookCore = unstable_cache(
  async (ownerIdArg?: string): Promise<CachedCore> => {
    // Defaults to the default owner (see getDefaultOwnerId's doc comment)
    // when no ownerId is given — the unprefixed public site (/, /book,
    // /guide/*) has no session to derive one from. Callers that DO know
    // (a signed-in guest's own booking, or a /o/[ownerSlug] page) pass
    // their resolved ownerId explicitly instead. teamUsers also picked up
    // an ownerId filter here — it was pulling showOnGuestGuide staff from
    // every owner on the platform into "Meet the team" before.
    const ownerId = ownerIdArg ?? (await getDefaultOwnerId());
    const [settings, teamUsers] = await Promise.all([
      prisma.settings.upsert({ where: { ownerId: ownerId! }, update: {}, create: { ownerId: ownerId! } }),
      prisma.user.findMany({
        where: { showOnGuestGuide: true, active: true, ownerId },
        select: { id: true, name: true, avatarColor: true, role: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      categories: (settings.guidebookCategories as unknown as GuidebookCategory[] | null) ?? GUIDEBOOK_CATEGORIES,
      amenities: (settings.amenities as unknown as Amenity[] | null) ?? AMENITIES,
      houseRules: (settings.houseRules as unknown as string[] | null) ?? HOUSE_RULES,
      contactPhone: settings.contactPhone,
      emergencyContactPhone: settings.emergencyContactPhone,
      messengerUsername: settings.messengerUsername,
      hostName: settings.hostName,
      hostBio: settings.hostBio,
      team: teamUsers.map((u) => ({ id: u.id, name: u.name, avatarColor: u.avatarColor, role: ROLE_LABEL[u.role] ?? u.role })),
      extensionFeePerHour: settings.extensionFeePerHour,
      flexibleTimeFee: settings.flexibleTimeFee,
      parkingCarRate: settings.parkingCarRate,
      parkingMotorcycleRate: settings.parkingMotorcycleRate,
      celebrationPackagePrice: settings.celebrationPackagePrice,
      celebrationPackageItems: (settings.celebrationPackageItems as unknown as string[] | null) ?? [],
      emergencyContacts: (settings.emergencyContacts as unknown as EmergencyContact[] | null) ?? [],
      staffContacts: (settings.staffContacts as unknown as EmergencyContact[] | null) ?? [],
      faqs: (settings.faqs as unknown as FaqCategory[] | null) ?? [],
      dpFee: settings.dpFee,
      weekdayRate12h: settings.weekdayRate12h,
      weekdayRate21h: settings.weekdayRate21h,
      weekendRate12h: settings.weekendRate12h,
      weekendRate21h: settings.weekendRate21h,
      weekdayNightPromoPct: settings.weekdayNightPromoPct,
      paymentQrUrl: settings.paymentQrUrl,
      paymentInstructions: settings.paymentInstructions,
      propertyLat: settings.propertyLat,
      propertyLng: settings.propertyLng,
    };
  },
  ["guidebook-core"],
  { revalidate: 60 }
);

/** Same null-falls-back-to-default pattern as CHECKLIST_GROUPS — an Admin
 * edit overrides the shipped content, an unset field keeps the default.
 * ownerId is optional — see getCachedGuidebookCore's doc comment above. */
export async function getGuidebookSettings(ownerIdArg?: string): Promise<GuidebookSettings> {
  const ownerId = ownerIdArg ?? (await getDefaultOwnerId());
  const [core, photos] = await Promise.all([
    getCachedGuidebookCore(ownerId ?? undefined),
    // Cheap (just 1-2 TEXT columns per person) and always fresh — see the
    // comment above for why these specifically stay out of the cache.
    prisma.settings.findUnique({ where: { ownerId: ownerId! }, select: { hostPhotoUrl: true } }),
  ]);
  let team = core.team.map((m) => ({ ...m, avatarUrl: null as string | null }));
  if (team.length > 0) {
    const teamPhotos = await prisma.user.findMany({
      where: { id: { in: core.team.map((m) => m.id) } },
      select: { id: true, avatarUrl: true },
    });
    const photoById = new Map(teamPhotos.map((u) => [u.id, u.avatarUrl]));
    team = team.map((m) => ({ ...m, avatarUrl: photoById.get(m.id) ?? null }));
  }
  return { ...core, hostPhotoUrl: photos?.hostPhotoUrl ?? null, team };
}

/**
 * Convenience wrapper for the /guide/* pages and home page: resolves the
 * currently signed-in guest's own host (via their most recent booking's
 * unit owner) and fetches that owner's guidebook — falling back to the
 * default owner for an anonymous visitor, exactly like getGuidebookSettings
 * already does when passed no ownerId. Centralizing this here (rather than
 * repeating getCurrentGuest+getGuestOwnerId in every page.tsx) is what
 * keeps a second real tenant's guests seeing their own amenities/house
 * rules/host bio instead of always Evangelina's.
 */
export async function getGuidebookSettingsForCurrentGuest(): Promise<GuidebookSettings> {
  const guest = await getCurrentGuest();
  const ownerId = guest ? await getGuestOwnerId(guest.id) : null;
  return getGuidebookSettings(ownerId ?? undefined);
}
