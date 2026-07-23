import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { GUIDEBOOK_CATEGORIES, AMENITIES, HOUSE_RULES, type GuidebookCategory, type Amenity } from "@/lib/guidebookContent";
import { ROLE_LABEL } from "@/lib/constants";

export type TeamMember = { id: string; name: string; avatarUrl: string | null; avatarColor: string; role: string };

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
const getCachedGuidebookCore = unstable_cache(
  async (): Promise<CachedCore> => {
    const [settings, teamUsers] = await Promise.all([
      prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
      prisma.user.findMany({
        where: { showOnGuestGuide: true, active: true },
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
    };
  },
  ["guidebook-core"],
  { revalidate: 60 }
);

/** Same null-falls-back-to-default pattern as CHECKLIST_GROUPS — an Admin
 * edit overrides the shipped content, an unset field keeps the default. */
export async function getGuidebookSettings(): Promise<GuidebookSettings> {
  const [core, photos] = await Promise.all([
    getCachedGuidebookCore(),
    // Cheap (just 1-2 TEXT columns per person) and always fresh — see the
    // comment above for why these specifically stay out of the cache.
    prisma.settings.findUnique({ where: { id: 1 }, select: { hostPhotoUrl: true } }),
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
