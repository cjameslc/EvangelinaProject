// Shared config used across the app — this mirrors the constants that used
// to live inline in each HTML page's <script> tag.

export const ROLE_LABEL: Record<string, string> = {
  OWNER_ADMIN: "Owner / Admin",
  CO_OWNER: "Co-owner",
  HOUSEKEEPING: "Housekeeping",
  BOOKER: "Booker",
  AUDITOR: "Auditor",
};

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-ish key used by <NavIcon>
};

// Which roles may see which nav tab / route.
// OWNER_ADMIN implicitly sees everything.
export const NAV_ITEMS: (NavItem & { roles: string[] })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid", roles: ["OWNER_ADMIN", "CO_OWNER"] },
  { href: "/bookings", label: "Bookings", icon: "file", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"] },
  { href: "/calendar", label: "Calendar", icon: "calendar", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"] },
  { href: "/housekeeping", label: "Housekeeping", icon: "home", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING"] },
  { href: "/auditor", label: "Auditor", icon: "search", roles: ["OWNER_ADMIN", "AUDITOR", "CO_OWNER"] },
  { href: "/admin", label: "Admin", icon: "settings", roles: ["OWNER_ADMIN"] },
];

export const STAY_TYPES = {
  Daycation: { label: "Daycation", short: "DAY", hrs: "12 hrs", color: "#C87D00" },
  Night: { label: "Night stay", short: "NIGHT", hrs: "12 hrs", color: "#6C5CE7" },
  Full: { label: "Full stay", short: "21-HR", hrs: "21 hrs", color: "#FF385C" },
  Cleaning: { label: "Cleaning", short: "CLEAN", hrs: "", color: "#8E99AA" },
  Maintenance: { label: "Maintenance", short: "MAINT", hrs: "", color: "#C87D00" },
} as const;

export const STAY_VARIANT: Record<string, string> = { Daycation: "day", Night: "night", Full: "full", Cleaning: "cleaning", Maintenance: "todo" };

export const PLATFORMS = ["Airbnb", "TikTok", "Facebook", "WalkIn", "Direct", "Other"] as const;
export const PLATFORM_LABEL: Record<string, string> = { WalkIn: "Walk-in" };

// Airbnb bookings are imported automatically from the unit's iCal feed and
// never have a guest-entered price — Airbnb doesn't expose the payout amount
// in .ics data, so revenue is derived from this fixed per-night rate instead.
export const AIRBNB_NIGHTLY_RATE = 1495;
export const PAYMENT_METHODS = ["Cash", "GCash", "BankTransfer"] as const;
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  Cash: "Cash",
  GCash: "GCash",
  BankTransfer: "Bank transfer",
};

export const BILL_TYPES = [
  { key: "amort", label: "Amortization", sub: "Monthly — property loan", icon: "🏦" },
  { key: "assoc", label: "Association Dues", sub: "Monthly — building admin", icon: "🏢" },
  { key: "water", label: "Water Bill", sub: "MWSS / building meter", icon: "💧" },
  { key: "elec", label: "Electricity Bill", sub: "Meralco — online payment", icon: "⚡" },
  { key: "net", label: "Internet Bill", sub: "Converge / PLDT — online", icon: "🌐" },
  { key: "stream", label: "Netflix Subscription", sub: "Monthly — card on file", icon: "📺" },
] as const;

// Housekeeping checklist — group name -> item labels.
// The `checked` column on HousekeepingUnitState is a boolean[][] with the
// same shape as this array (index-aligned).
export const CHECKLIST_GROUPS: { name: string; optional?: boolean; items: string[] }[] = [
  { name: "Before entering", items: ["Wear clean slippers or shoe covers", "Bring complete cleaning supplies and guest kit", "Open windows for ventilation", "Turn on lights and inspect the unit"] },
  { name: "Bedroom & living area", items: ["Make the bed with fresh sheets", "Replace pillowcases if needed", "Fold the blanket properly", "Check mattress and pillows for stains", "Vacuum or sweep the floor", "Mop the floor", "No hair on carpet or floor", "Dust all furniture and shelves", "Wipe TV, remote, tables and chairs", "Clean mirrors", "Clean windows and window sills", "Wipe door handles and light switches", "Empty trash bins", "Replace trash bags"] },
  { name: "Bathroom", items: ["Clean toilet bowl", "Clean toilet seat and cover", "Scrub the sink", "Clean the faucet", "Remove water stains", "Clean shower area", "Clean shower drain", "Clean mirrors", "Refill hand soap", "Replace tissue roll if needed", "Check bidet is working", "Check hot and cold shower", "Mop bathroom floor", "Remove all hair from floor and drain"] },
  { name: "Kitchen", items: ["Wash all used dishes", "Wipe kitchen counter", "Clean the sink", "Clean the faucet", "Clean microwave inside and out", "Clean rice cooker", "Clean electric kettle", "Wipe refrigerator inside and out", "Dispose of leftover food", "Check grease trap; clean if full", "Refill coffee", "Refill sugar", "Refill creamer", "Refill cooking oil", "Refill salt", "Refill pepper", "Refill filtered drinking water"] },
  { name: "Air-conditioning & appliances", items: ["Check air-conditioner operation", "Clean aircon filter if dirty", "Check the TV", "Check Wi-Fi connection", "Check the lights", "Check electrical outlets", "Check remote controls", "Replace remote batteries if needed"] },
  { name: "Guest supplies", items: ["Guest towels complete", "Face towels complete", "Bath mat clean", "Tissue stocked", "Guest kit complete", "Coffee set complete", "Drinking glasses clean", "Plates complete", "Bowls complete", "Spoons and forks complete"] },
  { name: "Safety & maintenance", items: ["Check smoke detector", "Check door lock", "Check windows lock properly", "Check for leaks", "Report broken items", "Report missing items", "Take maintenance photos if needed"] },
  { name: "Final inspection", items: ["Unit smells fresh", "No visible dust", "No hair anywhere", "All amenities arranged neatly", "Curtains properly arranged", "Lights turned off (except required)", "Aircon turned off", "Doors locked", "Take final photos", "Confirm unit is guest-ready"] },
  { name: "Deep cleaning (weekly / monthly)", optional: true, items: ["Deep clean aircon filter", "Wash curtains", "Deep clean refrigerator", "Deep clean microwave", "Clean behind furniture", "Clean under the bed", "Remove wall marks", "Polish mirrors and glass", "Deep clean bathroom grout", "Disinfect high-touch surfaces", "Inventory all supplies", "Restock housekeeping supplies", "Check furniture for damage", "Tighten loose screws or fixtures", "Replace worn-out items if necessary"] },
];

export const DEFAULT_STOCK: [string, number][] = [
  ["Tissue rolls", 4],
  ["Bath towels", 6],
  ["Bottled water", 8],
  ["Toiletry kits", 5],
  ["Trash bags", 10],
  ["Coffee/creamer sachets", 12],
];

export const LOW_STOCK_THRESHOLD = 2;
