export type UnsplashCategoryDef = { key: string; query: string; count: number };

// One entry = one Unsplash API call during cache-warming (see
// unsplashSync.ts) — 32 categories total, comfortably under the Demo-tier
// 50/hour cap even warmed fully cold in one run. Categories are shared
// across UI sections wherever the spec's own suggested search terms
// overlap (e.g. "Digital Key" tile background reuses the digital-key
// category instead of a duplicate call) — see each section's usage for
// which category key it reads.
export const UNSPLASH_CATEGORIES: UnsplashCategoryDef[] = [
  { key: "hero", query: "luxury staycation modern condo interior", count: 6 },

  { key: "room-info", query: "modern bedroom luxury apartment interior", count: 4 },
  { key: "digital-key", query: "smart lock digital door secure entrance", count: 3 },
  { key: "wifi", query: "remote work laptop high speed internet", count: 3 },
  { key: "house-rules", query: "clean apartment peaceful hospitality", count: 3 },

  { key: "amenity-coffee", query: "coffee maker kitchen", count: 2 },
  { key: "amenity-microwave", query: "microwave kitchen appliance", count: 2 },
  { key: "amenity-rice-cooker", query: "rice cooker kitchen", count: 2 },
  { key: "amenity-smart-tv", query: "smart tv living room", count: 2 },
  { key: "amenity-netflix", query: "streaming tv entertainment", count: 2 },
  { key: "amenity-bed", query: "comfortable bed hotel", count: 2 },
  { key: "amenity-bathroom", query: "modern bathroom", count: 2 },
  { key: "amenity-shower", query: "hotel shower", count: 2 },
  { key: "amenity-kitchen", query: "modern kitchen apartment", count: 2 },
  { key: "amenity-towels", query: "hotel towels folded", count: 2 },

  { key: "nearby-restaurants", query: "fine dining restaurant asian food", count: 4 },
  { key: "nearby-shopping", query: "shopping mall retail lifestyle", count: 4 },
  { key: "nearby-nightlife", query: "city lights cocktails skyline", count: 4 },
  { key: "nearby-attractions", query: "Philippines Quezon City Cubao", count: 4 },
  { key: "nearby-transportation", query: "train station city transport", count: 4 },

  { key: "gallery-bedroom", query: "bedroom interior design", count: 4 },
  { key: "gallery-living-area", query: "living room apartment", count: 4 },
  { key: "gallery-kitchen", query: "kitchen interior design", count: 4 },
  { key: "gallery-bathroom", query: "bathroom interior design", count: 4 },
  { key: "gallery-building", query: "modern apartment building exterior", count: 4 },
  { key: "gallery-lobby", query: "hotel lobby interior", count: 4 },
  { key: "gallery-amenities", query: "apartment amenities lifestyle", count: 4 },

  { key: "tile-checkin", query: "hotel reception desk", count: 2 },
  { key: "tile-parking", query: "parking garage", count: 2 },
  { key: "tile-laundry", query: "washing machine laundry", count: 2 },
  { key: "tile-emergency", query: "emergency assistance help", count: 2 },
  { key: "tile-guest-guide", query: "travel guide map planning", count: 2 },
  { key: "tile-faqs", query: "hotel concierge desk", count: 2 },
  { key: "tile-support", query: "smiling receptionist hospitality", count: 2 },
];

export const UNSPLASH_CATEGORY_KEYS = UNSPLASH_CATEGORIES.map((c) => c.key);
