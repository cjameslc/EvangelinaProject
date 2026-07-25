import type { NearbySlug } from "@/lib/guideNav";

/** Unsplash category key for each "Explore the neighborhood" slug that has
 * no real business photo — food/coffee/grocery/transportation already have
 * one (CATEGORY_COVER_PHOTOS in guideNav.ts) and are left untouched here. */
export const NEARBY_UNSPLASH_CATEGORY: Partial<Record<NearbySlug, string>> = {
  hospitals: "nearby-hospitals",
  schools: "nearby-schools",
  nightlife: "nearby-nightlife",
  concert: "nearby-concert",
};

/** Maps a fixed AMENITIES label (guidebookContent.ts) to the Unsplash
 * category that best illustrates it — only labels with a clear single-
 * subject match get one; the rest keep their plain icon+text pill. */
export const AMENITY_UNSPLASH_CATEGORIES: { label: string; category: string; title: string }[] = [
  { label: "Queen Size Bed", category: "amenity-bed", title: "Comfortable bed" },
  { label: "50-inch Smart TV with Netflix, HBO, Amazon Prime & Vivamax", category: "amenity-smart-tv", title: "Smart TV & streaming" },
  { label: "Free Coffee", category: "amenity-coffee", title: "Coffee maker" },
  { label: "Microwave", category: "amenity-microwave", title: "Microwave" },
  { label: "Rice Cooker", category: "amenity-rice-cooker", title: "Rice cooker" },
  { label: "Hot Shower", category: "amenity-shower", title: "Hot shower" },
  { label: "Bidet", category: "amenity-bathroom", title: "Modern bathroom" },
  { label: "Basic Kitchenware", category: "amenity-kitchen", title: "Full kitchen" },
  { label: "Towels", category: "amenity-towels", title: "Fresh towels" },
];
