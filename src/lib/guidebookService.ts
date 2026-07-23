import { prisma } from "@/lib/prisma";
import { GUIDEBOOK_CATEGORIES, AMENITIES, HOUSE_RULES, type GuidebookCategory, type Amenity } from "@/lib/guidebookContent";
import { ROLE_LABEL } from "@/lib/constants";

export type TeamMember = { name: string; avatarUrl: string | null; avatarColor: string; role: string };

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

/** Same null-falls-back-to-default pattern as CHECKLIST_GROUPS — an Admin
 * edit overrides the shipped content, an unset field keeps the default. */
export async function getGuidebookSettings(): Promise<GuidebookSettings> {
  const [settings, teamUsers] = await Promise.all([
    prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    // "Meet our team" — opt-in only (User.showOnGuestGuide), referencing
    // each account's own real name/photo from Users & roles rather than
    // duplicating that data into a separate guidebook-only field. Archived
    // (active: false) staff never show, even if they were opted in before.
    prisma.user.findMany({
      where: { showOnGuestGuide: true, active: true },
      select: { name: true, avatarUrl: true, avatarColor: true, role: true },
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
    hostPhotoUrl: settings.hostPhotoUrl,
    hostBio: settings.hostBio,
    team: teamUsers.map((u) => ({ name: u.name, avatarUrl: u.avatarUrl, avatarColor: u.avatarColor, role: ROLE_LABEL[u.role] ?? u.role })),
  };
}
