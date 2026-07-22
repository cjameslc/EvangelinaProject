// Digital Guidebook default content — Guest Experience module.
// Admin-editable overrides live on Settings (guidebookCategories/amenities/
// houseRules, JSON-encoded — same null-falls-back-to-default pattern as
// CHECKLIST_GROUPS in constants.ts). These are the as-shipped defaults,
// populated from the business's own real neighborhood/amenity list so the
// guidebook is genuinely useful on day one, not filled with placeholders.

export type GuidebookCategory = {
  key: string;
  label: string;
  icon: string;
  items: string[];
};

/** Nearby places, grouped — each item becomes a tappable Google Maps search
 * link (see guidebookMapsUrl in guideUtils.ts). No travel-time estimates
 * are fabricated here; Maps computes the real distance/time when opened. */
export const GUIDEBOOK_CATEGORIES: GuidebookCategory[] = [
  { key: "shopping", label: "Shopping Centers", icon: "🛍️", items: ["Gateway Mall", "Gateway Mall 2", "Ali Mall", "Farmers Plaza", "SM Cubao", "Shopwise Cubao"] },
  { key: "convenience", label: "Convenience Stores", icon: "🏪", items: ["Alphamart (Ground Floor)", "7-Eleven", "Ministop", "Uncle John's"] },
  { key: "grocery", label: "Grocery Stores", icon: "🛒", items: ["Shopwise", "Farmers Market", "SM Supermarket", "Robinsons Supermarket"] },
  { key: "coffee", label: "Coffee Shops", icon: "☕", items: ["Starbucks", "Coffee Bean & Tea Leaf", "Tim Hortons", "Dunkin'", "Bo's Coffee"] },
  { key: "fastfood", label: "Fast Food", icon: "🍔", items: ["McDonald's", "Jollibee", "Chowking", "Mang Inasal", "KFC", "Burger King", "Wendy's", "Greenwich"] },
  { key: "restaurants", label: "Restaurants", icon: "🍽️", items: ["Cubao Expo Restaurants", "Bellini's", "Food Court", "Gateway Food Choices", "Manhattan Food Strip"] },
  { key: "attractions", label: "Tourist Attractions", icon: "🎟️", items: ["Smart Araneta Coliseum", "Cubao Expo", "New Frontier Theater", "Art in Island Museum", "Quezon Memorial Circle", "Ninoy Aquino Parks and Wildlife Center", "UP Diliman"] },
  { key: "entertainment", label: "Entertainment", icon: "🎮", items: ["Timezone Gateway", "Quantum Amusement", "Movie Cinemas", "Karaoke Bars", "Bowling Centers"] },
  { key: "parks", label: "Parks", icon: "🌳", items: ["Quezon Memorial Circle", "Ninoy Aquino Parks and Wildlife", "UP Academic Oval"] },
  { key: "schools", label: "Schools & Universities", icon: "🎓", items: ["Ateneo de Manila University", "Miriam College", "University of the Philippines Diliman", "PSBA Quezon City", "St. Paul University Quezon City", "Trinity University of Asia", "FEU Roosevelt"] },
  { key: "hospitals", label: "Hospitals", icon: "🏥", items: ["Quirino Memorial Medical Center", "World Citi Medical Center", "East Avenue Medical Center", "Philippine Heart Center", "Lung Center of the Philippines", "National Kidney and Transplant Institute", "St. Luke's Medical Center Quezon City"] },
  { key: "churches", label: "Churches", icon: "⛪", items: ["Immaculate Conception Cathedral", "Christ the King Parish", "St. Paul the Apostle Parish"] },
  { key: "transportation", label: "Transportation", icon: "🚌", items: ["MRT Cubao Station", "LRT 2 Cubao Station", "Araneta City Bus Port", "Five Star Bus Terminal", "Victory Liner Terminal", "Genesis Bus Terminal", "Baliwag Transit", "Solid North Bus Terminal", "EDSA Carousel Bus Stop", "Jeepney Terminal", "Taxi Bay", "Grab Pickup Area"] },
  { key: "business", label: "Business Centers", icon: "🏢", items: ["Araneta City", "Cyberpark Towers", "Gateway Tower", "Ali Mall Offices"] },
  { key: "pharmacies", label: "Pharmacies", icon: "💊", items: ["Mercury Drug", "Watsons", "Southstar Drug"] },
  { key: "banks", label: "Banks", icon: "🏦", items: ["BDO", "BPI", "Metrobank", "Landbank", "RCBC", "Security Bank"] },
  { key: "essentials", label: "Essentials", icon: "🧺", items: ["Laundry Shops", "Water Refilling Stations", "Printing Shops", "ATMs", "Clinics"] },
];

/** Inside the building — not "nearby," so kept separate from the Maps-linked
 * categories above (these don't need a directions link, guest is already there). */
export const BUILDING_INFO = {
  groundFloor: ["Alphamart", "Food Court", "Coffee Shop", "Laundry Area", "Lobby", "Security Office"],
  features: ["24/7 Security", "CCTV", "Elevators", "Paid Parking", "RFID Access", "Reception Lobby"],
};

export type Amenity = { icon: string; label: string };

export const AMENITIES: Amenity[] = [
  { icon: "🛏️", label: "Queen Size Bed" },
  { icon: "❄️", label: "Carrier 1HP Air Conditioner" },
  { icon: "📺", label: "50-inch Smart TV with Netflix, HBO, Amazon Prime & Vivamax" },
  { icon: "📶", label: "High Speed WiFi" },
  { icon: "☕", label: "Free Coffee" },
  { icon: "💧", label: "Free Drinking Water" },
  { icon: "🍳", label: "Multipurpose Cooker" },
  { icon: "🍚", label: "Rice Cooker" },
  { icon: "🍴", label: "Basic Kitchenware" },
  { icon: "🧂", label: "Salt & Pepper" },
  { icon: "🛁", label: "Towels" },
  { icon: "🎁", label: "Guest Kit (Shampoo, Soap, Toothbrush, Toothpaste, Tissue)" },
  { icon: "🎲", label: "Board Games, Chess & Playing Cards" },
];

/** No house rules were provided as shipped content — Admin adds these from
 * the guidebook content editor rather than the guidebook fabricating policy
 * language the business never actually set. */
export const HOUSE_RULES: string[] = [];

/** Guest-type quick filters for the guidebook's "For you" recommendations —
 * each maps to a subset of the categories above, not fabricated new places. */
export const SMART_RECOMMENDATIONS: { key: string; label: string; icon: string; categoryKeys: string[] }[] = [
  { key: "family", label: "Traveling with family", icon: "👨‍👩‍👧‍👦", categoryKeys: ["fastfood", "restaurants", "parks", "shopping", "entertainment"] },
  { key: "couple", label: "Here as a couple", icon: "💑", categoryKeys: ["coffee", "restaurants", "entertainment", "attractions"] },
  { key: "concert", label: "Here for a concert", icon: "🎤", categoryKeys: ["attractions", "fastfood", "convenience", "transportation"] },
  { key: "business", label: "Business trip", icon: "💼", categoryKeys: ["coffee", "business", "essentials", "banks"] },
];

/** Suggested opening questions for the AI Concierge quick-start chips. */
export const CONCIERGE_SAMPLE_QUESTIONS = [
  "Where can we eat nearby?",
  "What's the WiFi password?",
  "How do we unlock the door?",
  "Where's the nearest ATM or pharmacy?",
  "Can we request a late checkout?",
  "How do we get to the MRT?",
  "What tourist spots can we visit?",
  "Is Grab available here?",
];
