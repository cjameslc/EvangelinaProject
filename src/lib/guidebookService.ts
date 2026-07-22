import { prisma } from "@/lib/prisma";
import { GUIDEBOOK_CATEGORIES, AMENITIES, HOUSE_RULES, type GuidebookCategory, type Amenity } from "@/lib/guidebookContent";

export type GuidebookSettings = {
  categories: GuidebookCategory[];
  amenities: Amenity[];
  houseRules: string[];
  contactPhone: string | null;
  emergencyContactPhone: string | null;
  messengerUsername: string | null;
};

/** Same null-falls-back-to-default pattern as CHECKLIST_GROUPS — an Admin
 * edit overrides the shipped content, an unset field keeps the default. */
export async function getGuidebookSettings(): Promise<GuidebookSettings> {
  const settings = await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  return {
    categories: (settings.guidebookCategories as unknown as GuidebookCategory[] | null) ?? GUIDEBOOK_CATEGORIES,
    amenities: (settings.amenities as unknown as Amenity[] | null) ?? AMENITIES,
    houseRules: (settings.houseRules as unknown as string[] | null) ?? HOUSE_RULES,
    contactPhone: settings.contactPhone,
    emergencyContactPhone: settings.emergencyContactPhone,
    messengerUsername: settings.messengerUsername,
  };
}
