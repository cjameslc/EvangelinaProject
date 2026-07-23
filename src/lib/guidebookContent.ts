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
  { icon: "📶", label: "Free WiFi" },
  { icon: "☕", label: "Free Coffee" },
  { icon: "💧", label: "Filtered Drinking Water" },
  { icon: "🧊", label: "Refrigerator" },
  { icon: "🍽️", label: "Microwave" },
  { icon: "🍚", label: "Rice Cooker" },
  { icon: "🍳", label: "Multipurpose Cooker" },
  { icon: "☕", label: "Electric Kettle" },
  { icon: "💇", label: "Hair Dryer" },
  { icon: "🚿", label: "Hot Shower" },
  { icon: "🚽", label: "Bidet" },
  { icon: "🍴", label: "Basic Kitchenware" },
  { icon: "🧂", label: "Salt & Pepper" },
  { icon: "🛁", label: "Towels" },
  { icon: "🎁", label: "Guest Toiletries (Shampoo, Soap, Toothbrush, Toothpaste, Tissue)" },
  { icon: "🎲", label: "Board Games, Chess & Playing Cards" },
];

/** No house rules were provided as shipped content — Admin adds these from
 * the guidebook content editor rather than the guidebook fabricating policy
 * language the business never actually set. */
export const HOUSE_RULES: string[] = [];

/** The self check-in walkthrough — fixed building procedure (not a
 * per-unit or admin-editable field, since it describes how the building's
 * front desk/security process works, not this business's own content).
 * The final step's actual code is filled in per-unit at render time from
 * Unit.doorCode — never hardcoded here. */
export type CheckInStep = { step: number; title: string; body: string[] };
export const CHECKIN_STEPS: CheckInStep[] = [
  { step: 1, title: "Before check-in", body: ["Please send the valid IDs of ALL guests before arrival.", "This is required by the building administration."] },
  { step: 2, title: "Arrival", body: ["Pin \"Urban Deca Towers Cubao\" in Grab or JoyRide."] },
  { step: 3, title: "Lobby", body: ["Proceed to the Main Lobby facing EDSA."] },
  { step: 4, title: "Security guard", body: ["Present your booking confirmation, a valid ID, and complete the guest form.", "Security may temporarily hold one valid ID."] },
  { step: 5, title: "RFID card", body: ["A staff member will meet you in the lobby and hand over the RFID tap card."] },
  { step: 6, title: "Access your unit", body: ["Use your assigned door code below."] },
];

/** The checkout checklist — same reasoning as CHECKIN_STEPS: fixed
 * procedure, not admin-editable content. */
export const CHECKOUT_CHECKLIST: string[] = [
  "Turn off aircon",
  "Turn off TV",
  "Dispose of trash",
  "Wash used dishes",
  "Lock the door",
  "Leave the RFID card inside the room",
  "Final inspection",
];

/** Guest-type quick filters for the guidebook's "For you" recommendations —
 * each maps to a subset of the categories above, not fabricated new places. */
export const SMART_RECOMMENDATIONS: { key: string; label: string; icon: string; categoryKeys: string[] }[] = [
  { key: "family", label: "Traveling with family", icon: "👨‍👩‍👧‍👦", categoryKeys: ["fastfood", "restaurants", "parks", "shopping", "entertainment"] },
  { key: "couple", label: "Here as a couple", icon: "💑", categoryKeys: ["coffee", "restaurants", "entertainment", "attractions"] },
  { key: "concert", label: "Here for a concert", icon: "🎤", categoryKeys: ["attractions", "fastfood", "convenience", "transportation"] },
  { key: "business", label: "Business trip", icon: "💼", categoryKeys: ["coffee", "business", "essentials", "banks"] },
  { key: "nightlife", label: "Nightlife & evenings", icon: "🌃", categoryKeys: ["entertainment", "restaurants", "fastfood"] },
  { key: "work", label: "Working remotely", icon: "💻", categoryKeys: ["coffee", "business", "essentials"] },
  { key: "photo", label: "Photo-worthy spots", icon: "📸", categoryKeys: ["attractions", "parks"] },
  { key: "latenight", label: "Late-night food", icon: "🍜", categoryKeys: ["fastfood", "convenience"] },
];

/** Hospitality quick-tips — each just jumps to a real existing category
 * below (via a search-term match against that category's label), never a
 * specific "hidden gem" place this app has no real data to back up. */
export const GUEST_TIPS: { icon: string; label: string; blurb: string; searchTerm: string }[] = [
  { icon: "🥐", label: "Best breakfast nearby", blurb: "Quick options for your first morning.", searchTerm: "fast food" },
  { icon: "🛒", label: "Grocery before check-in", blurb: "Stock up on snacks and drinks for the room.", searchTerm: "grocery" },
  { icon: "🌙", label: "Late-night food", blurb: "Look for the 24-hour badge below.", searchTerm: "fast food" },
  { icon: "🏧", label: "Nearest ATM", blurb: "Several banks within a short walk.", searchTerm: "bank" },
  { icon: "💊", label: "Nearest pharmacy", blurb: "Mercury Drug, Watsons, and more nearby.", searchTerm: "pharmac" },
  { icon: "🏥", label: "Emergency hospital", blurb: "Good to know before you need it.", searchTerm: "hospital" },
  { icon: "🎤", label: "After a Smart Araneta concert", blurb: "Grab a late bite on the way back.", searchTerm: "fast food" },
  { icon: "📸", label: "Photo-worthy spots", blurb: "Parks and landmarks worth a visit.", searchTerm: "attraction" },
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

/** Guest Experience "Reviews" page — real guest quotes as provided by the
 * host (sourced from the business's Airbnb/Google listings), not
 * fabricated. overallRating/reviewCount/recommendPct reflect the listing's
 * real aggregate stats; categoryRatings is the platform's category
 * breakdown. Update this block, not the page component, when new real
 * reviews come in. */
export type GuestReview = { name: string; unit: string; date: string; quote: string };

export const REVIEW_SUMMARY = {
  overallRating: 4.9,
  reviewCount: 247,
  recommendPct: 98,
  categoryRatings: [
    { label: "Cleanliness", value: 4.9 },
    { label: "Communication", value: 5.0 },
    { label: "Check-in Experience", value: 5.0 },
    { label: "Accuracy", value: 4.9 },
    { label: "Location", value: 4.9 },
    { label: "Value for Money", value: 4.9 },
    { label: "Amenities", value: 4.8 },
    { label: "Comfort", value: 4.9 },
  ],
};

export const GUEST_REVIEWS: GuestReview[] = [
  { name: "Maria Santos", unit: "Unit 1116", date: "June 2026", quote: "Super clean and very cozy! The room looked exactly like the photos. The location is perfect—Gateway Mall and Smart Araneta Coliseum are just a short walk away. Will definitely book again!" },
  { name: "John Reyes", unit: "Unit 2045", date: "June 2026", quote: "The self check-in process was incredibly smooth, and the host responded quickly whenever we had questions. The room was spotless and complete with everything we needed." },
  { name: "Angela Cruz", unit: "Unit 1845", date: "May 2026", quote: "We booked for a concert at Smart Araneta Coliseum and couldn't have chosen a better place. It's very convenient, safe, and surrounded by restaurants and shopping malls." },
  { name: "Kevin Lim", unit: "Unit 1558", date: "May 2026", quote: "Excellent value for money! Fast WiFi, comfortable bed, Netflix, and free coffee made our stay even better. Highly recommended for work and leisure." },
  { name: "Patricia Gomez", unit: "Unit 1117", date: "April 2026", quote: "One of the cleanest Airbnb stays we've experienced. Everything was well prepared before we arrived, and the digital guidebook was extremely helpful." },
  { name: "Michael Tan", unit: "Unit 2045", date: "April 2026", quote: "My family enjoyed our stay! The unit was complete with kitchen essentials, and having Alphamart on the ground floor was so convenient." },
  { name: "Christine Dela Cruz", unit: "Unit 1116", date: "March 2026", quote: "The location is unbeatable. MRT, LRT, malls, coffee shops, and restaurants are all within walking distance. We hardly needed to take a taxi." },
  { name: "Ralph Mendoza", unit: "Unit 1558", date: "March 2026", quote: "The host was accommodating from booking until checkout. The instructions were clear, and the smart lock made check-in hassle-free." },
  { name: "Samantha Lee", unit: "Unit 1845", date: "February 2026", quote: "A perfect place for a weekend staycation. Quiet, relaxing, modern, and very well maintained. We'll definitely return." },
  { name: "David Ong", unit: "Unit 1117", date: "February 2026", quote: "We stayed here for a business trip and loved how convenient everything was. Reliable WiFi, comfortable workspace, and easy access to transportation." },
];
