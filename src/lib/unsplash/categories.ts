export type UnsplashCategoryDef = { key: string; query: string; count: number };

// One entry = one Unsplash API call during cache-warming (see
// unsplashSync.ts) — 37 categories total, comfortably under the Demo-tier
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
  // "Philippines Quezon City Cubao" (the spec's literal suggested terms,
  // combined) returned zero results from Unsplash's random endpoint — too
  // narrow a combination. Broadened to what actually has real inventory.
  { key: "nearby-attractions", query: "Philippines cityscape landmark", count: 4 },
  { key: "nearby-transportation", query: "train station city transport", count: 4 },
  { key: "nearby-hospitals", query: "hospital medical clinic healthcare", count: 3 },
  { key: "nearby-schools", query: "university campus college students", count: 3 },
  { key: "nearby-concert", query: "concert arena stage lights", count: 3 },

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

  // Gamification module (My Earnings > Elite Booker Challenge world map +
  // Teams section) — one query per journey zone / team theme, per the
  // visual-enhancement spec. Unit Priority Cards deliberately reuse the
  // existing gallery-bedroom/gallery-living-area/room-info categories
  // above instead of adding 3 more calls here — they already match the
  // requested "cozy condo / luxury bedroom / modern interior" keywords.
  { key: "journey-village", query: "cozy neighborhood residential street", count: 2 },
  { key: "journey-forest", query: "lush pine forest nature trail", count: 2 },
  { key: "journey-castle", query: "boutique luxury hotel lobby", count: 2 },
  { key: "journey-peak", query: "mountain summit scenic viewpoint", count: 2 },
  { key: "journey-volcano", query: "volcanic mountain dramatic landscape", count: 2 },
  { key: "journey-sky", query: "blue sky aerial clouds", count: 2 },
  { key: "journey-kingdom", query: "luxury penthouse skyline night lights", count: 2 },
  { key: "team-booking", query: "hotel reception hospitality handshake", count: 2 },
  { key: "team-housekeeping", query: "clean hotel room fresh linens luxury bedroom", count: 2 },
  { key: "team-operations", query: "building maintenance technician property management", count: 2 },
];
