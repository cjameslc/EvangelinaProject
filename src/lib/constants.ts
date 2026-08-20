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
  /** One-line "what's in here" shown under the label in the More menu — this app's roles mostly see 0-2 overflow items, so a labeled group header would sit over a single row; a subtitle carries the same "which business area" context without that. */
  subtitle: string;
  /** Loose grouping used only for the dynamic "More" trigger label (e.g. shows "Finance" instead of "More" once you're on My Earnings) — not rendered as a section header, see subtitle above. */
  group: "Operations" | "Finance" | "Marketing" | "Insights" | "Administration";
};

// Which roles may see which nav tab / route.
// OWNER_ADMIN implicitly sees everything.
export const NAV_ITEMS: (NavItem & { roles: string[] })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid", subtitle: "Today at a glance", group: "Operations", roles: ["OWNER_ADMIN", "CO_OWNER"] },
  { href: "/analytics", label: "Analytics", icon: "chart", subtitle: "Performance & trends", group: "Insights", roles: ["OWNER_ADMIN", "CO_OWNER"] },
  { href: "/bookings", label: "Bookings", icon: "file", subtitle: "Reservations & guests", group: "Operations", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"] },
  { href: "/calendar", label: "Calendar", icon: "calendar", subtitle: "Availability & schedule", group: "Operations", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER"] },
  { href: "/social", label: "Social", icon: "megaphone", subtitle: "Posts & promotions", group: "Marketing", roles: ["OWNER_ADMIN", "CO_OWNER", "BOOKER", "HOUSEKEEPING", "AUDITOR"] },
  { href: "/housekeeping", label: "Housekeeping", icon: "home", subtitle: "Cleaning & turnovers", group: "Operations", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING"] },
  { href: "/earnings", label: "My Earnings", icon: "wallet", subtitle: "Payroll & performance", group: "Finance", roles: ["OWNER_ADMIN", "CO_OWNER", "HOUSEKEEPING", "BOOKER", "AUDITOR"] },
  { href: "/auditor", label: "Auditor", icon: "search", subtitle: "Quality & compliance", group: "Insights", roles: ["OWNER_ADMIN", "AUDITOR", "CO_OWNER"] },
  { href: "/admin", label: "Admin", icon: "settings", subtitle: "Units, users & settings", group: "Administration", roles: ["OWNER_ADMIN"] },
];

// Shared by Navbar (desktop) and BottomNav (mobile) so the two nav surfaces
// can never drift on which tabs a role sees. additionalPages is the
// Owner-configurable grant layer on top of role defaults — see
// effectivePageAccess() in src/lib/pageAccess.ts, the same resolver
// middleware's route guard uses, so nav visibility and route enforcement
// can never quietly disagree. enabledModules is that same function's
// restrictive per-owner tier ceiling, applied last — null/undefined means
// unrestricted (every owner from before this field existed).
export function visibleNavItems(role: string | undefined, additionalPages: string[] = [], enabledModules?: string[] | null) {
  const items = NAV_ITEMS.filter((i) => role === "OWNER_ADMIN" || (role && i.roles.includes(role)) || additionalPages.includes(i.href));
  if (!enabledModules) return items;
  return items.filter((i) => enabledModules.includes(i.href));
}

// Collaborative earning groups for My Earnings' Team Performance section —
// Employee.teamKey points into this, independent of role (a team can mix
// Bookers and Housekeeping). Purely a display/config lookup, not a Prisma
// model, matching how STAY_TYPES/PLATFORMS below are also just labeled
// constants over a plain string column.
export const TEAMS: Record<string, { key: string; name: string; color: string; emoji: string }> = {
  A: { key: "A", name: "Team A", color: "#008A05", emoji: "🟢" },
  B: { key: "B", name: "Team B", color: "#3B71E8", emoji: "🔵" },
  C: { key: "C", name: "Team C", color: "#6C5CE7", emoji: "🟣" },
};

export const STAY_TYPES = {
  Daycation: { label: "Daycation", short: "DAY", hrs: "12 hrs", color: "#C87D00" },
  Night: { label: "Night stay", short: "NIGHT", hrs: "12 hrs", color: "#6C5CE7" },
  Full: { label: "Full stay", short: "21-HR", hrs: "21 hrs", color: "#FF385C" },
  // Same-day only — any check-in/check-out time the booker picks, not a
  // fixed window like Daycation/Night. Staff-only for now (not offered in
  // the Guest Portal booking flow). See stayRange.ts's bookingsConflict for
  // the real time-of-day overlap checking this type gets that others don't.
  Flexible: { label: "Flexible", short: "FLEX", hrs: "same day", color: "#0EA5A0" },
  Cleaning: { label: "Cleaning", short: "CLEAN", hrs: "", color: "#8E99AA" },
  Maintenance: { label: "Maintenance", short: "MAINT", hrs: "", color: "#C87D00" },
} as const;

// Calendar-grid display metadata (label/color/icon) — distinct from
// STAY_TYPES above, which backs booking forms/tables elsewhere and keeps
// its own labels ("Full stay") and palette. Shared by both calendar
// surfaces (/calendar's multi-unit Gantt and /calendar/[unitId]'s monthly
// view) so their legends and tile colors are the same thing, not two
// independently-maintained lists that can drift apart.
export const CALENDAR_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  Full: { label: "21-Hour", color: "#3B71E8", icon: "🛏️" },
  Night: { label: "Night stay", color: "#7C5CE7", icon: "🌙" },
  Daycation: { label: "Daycation", color: "#0D9E6E", icon: "☀️" },
  Flexible: { label: "Flexible", color: "#0EA5A0", icon: "🕐" },
  Cleaning: { label: "Cleaning", color: "#8E99AA", icon: "🧹" },
  Maintenance: { label: "Maintenance", color: "#C87D00", icon: "🔧" },
};

// A Cleaning block that's been closed off (endDate set — housekeeping
// marked the unit clean) gets this distinct color/icon instead of the
// plain "in progress" Cleaning one above, on both calendar surfaces.
export const CALENDAR_CLEANING_DONE = { label: "Cleaned", color: "#008A05", icon: "✅" };

// Airbnb bookings get this dedicated tile color instead of their stay
// type's — rausch, the app's brand red (itself Airbnb's own "Rausch"
// brand color) — on both calendar surfaces, since Airbnb drives most of
// the business and is worth recognizing at a glance. Airbnb has no
// day-use product, so every Airbnb booking is a Full (21-Hour) stay.
export const CALENDAR_AIRBNB_COLOR = "#FF385C";

// Default check-in/check-out clock times per stay type, used both by
// BookingForm's smartSchedule() (the UI pre-fill) and by stayRange.ts's
// getOccupiedWindow() (the fallback when a booking has no explicit
// checkInTime/checkOutTime, e.g. Airbnb imports and legacy-migrated rows) —
// one shared table so the two can never quietly drift apart.
export const STAY_TYPE_DEFAULT_TIMES: Record<string, { checkInTime: string; checkOutTime: string; nextDay: boolean }> = {
  Daycation: { checkInTime: "08:00", checkOutTime: "20:00", nextDay: false },
  Flexible: { checkInTime: "08:00", checkOutTime: "20:00", nextDay: false },
  Night: { checkInTime: "14:00", checkOutTime: "12:00", nextDay: true },
  Full: { checkInTime: "14:00", checkOutTime: "12:00", nextDay: true },
};

// Airbnb's standard check-in/check-out — distinct from (and one hour
// earlier out than) the generic Full-stay default above, since Airbnb's
// own house rules are 2:00 PM / 11:00 AM, not this property's usual 12:00
// PM checkout. Applied when a new Airbnb booking is imported (icalSync.ts)
// and suggested when staff manually pick "Airbnb" in BookingForm — either
// way it's a real, stored value any Booker can edit afterward (e.g. a guest
// requests an early check-in or late checkout), never a locked field.
export const AIRBNB_DEFAULT_TIMES = { checkInTime: "14:00", checkOutTime: "11:00", nextDay: true };

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
export const CHECKLIST_GROUPS: { name: string; optional?: boolean; items: string[]; unitIds?: string[] }[] = [
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

export const LOW_STOCK_THRESHOLD = 2;
