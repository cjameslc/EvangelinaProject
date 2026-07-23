// Editorial flavor for Nearby place cards — fun facts and "host recommends"
// tags, deterministically chosen by category (never per-place AI/random),
// plus data-grounded "smart highlight" badges computed from a place's own
// real fetched fields. Deliberately excludes any claim this app has no
// data for — no "Guest Favorite," "Most Popular," or "guests love this,"
// since nothing here tracks real guest visits or collects real reviews
// (see /guide/reviews' honest empty state). Everything below is either a
// generic category vibe (not a factual claim about this specific place)
// or directly derived from that place's own PlaceInsight row.

export type Badge = { icon: string; label: string };

const FUN_FACTS_BY_CATEGORY: Record<string, string[]> = {
  shopping: ["🏬 One of the busier shopping hubs in Quezon City.", "🛍️ Good for a few hours of air-conditioned browsing."],
  convenience: ["🏪 Handy for last-minute snacks, drinks, or a phone load.", "🌙 Most branches stay open late."],
  grocery: ["🛒 Good for stocking up on snacks and drinks for the room.", "🧴 Worth checking if you forgot any toiletries."],
  coffee: ["☕ A solid stop to fuel up before exploring Cubao.", "💻 Many branches are fine for getting a bit of work done."],
  fastfood: ["🍔 Quick and easy between errands.", "🌙 Good for late-night cravings."],
  restaurants: ["🍽️ Worth the short trip for a proper sit-down meal.", "🍜 Good variety within a few minutes of the property."],
  attractions: ["🎟️ Worth setting aside a few hours for.", "📸 A good option if you want to see more of the city."],
  entertainment: ["🎮 Good for groups looking to unwind for an evening.", "🎳 A fun way to spend a few hours nearby."],
  parks: ["🌳 A nice change of pace if you want some fresh air.", "🚶 Good for a relaxed walk outside the unit."],
  schools: ["🎓 A well-known institution in the area.", "📚 Useful landmark if you need a reference point."],
  hospitals: ["🏥 Good to know the nearest one, just in case.", "🚑 Worth saving the address for peace of mind."],
  churches: ["⛪ A quiet option if you're looking for one nearby.", "🕯️ Worth checking service schedules ahead of a visit."],
  transportation: ["🚆 Useful for getting around without a car.", "🚌 Good option if you'd rather skip EDSA traffic."],
  business: ["🏢 A notable business hub in the area.", "💼 Good landmark if you're meeting someone nearby."],
  pharmacies: ["💊 Good to know in case you need anything last-minute.", "🩹 Handy for basic medicine or first-aid supplies."],
  banks: ["🏦 Useful if you need to handle banking or withdraw cash.", "💳 Good to know the nearest ATM."],
  essentials: ["🧺 Handy for laundry, printing, or other errands.", "🔑 Good to have on your radar for everyday needs."],
};

const HOST_RECOMMENDS_BY_CATEGORY: Record<string, Badge[]> = {
  shopping: [{ icon: "🛍", label: "Great shopping destination" }],
  convenience: [{ icon: "🌙", label: "Good for late-night runs" }],
  grocery: [{ icon: "🛒", label: "Good for stocking up" }],
  coffee: [{ icon: "☕", label: "Perfect for coffee lovers" }, { icon: "💻", label: "Good for working remotely" }],
  fastfood: [{ icon: "🍜", label: "Quick, budget-friendly food" }],
  restaurants: [{ icon: "👨‍👩‍👧", label: "Great for families" }, { icon: "💙", label: "Good for a date night" }],
  attractions: [{ icon: "📸", label: "Worth the visit if you have time" }],
  entertainment: [{ icon: "👨‍👩‍👧", label: "Ideal for families and groups" }],
  parks: [{ icon: "🌳", label: "Best visited in daylight" }],
  schools: [{ icon: "🎓", label: "Notable landmark" }],
  hospitals: [{ icon: "🏥", label: "Good to know for emergencies" }],
  churches: [{ icon: "⛪", label: "Quiet and close by" }],
  transportation: [{ icon: "🚆", label: "Skip the EDSA traffic" }],
  business: [{ icon: "💼", label: "Good meeting-point landmark" }],
  pharmacies: [{ icon: "💊", label: "Good for last-minute needs" }],
  banks: [{ icon: "🏦", label: "Handy for banking" }],
  essentials: [{ icon: "🧺", label: "Good for everyday errands" }],
};

/** Stable, deterministic pick — same place always gets the same fun fact
 * (no flicker between renders, no client/server mismatch), varied across
 * different places in the same category via a cheap string hash. */
function pick<T>(arr: T[], seed: string): T | null {
  if (arr.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[hash % arr.length];
}

export function getFunFact(category: string, placeName: string): string | null {
  return pick(FUN_FACTS_BY_CATEGORY[category] ?? [], placeName);
}

export function getHostRecommends(category: string): Badge[] {
  return HOST_RECOMMENDS_BY_CATEGORY[category] ?? [];
}

type InsightForBadges = {
  distanceMeters?: number | null;
  walkMinutes?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
  priceLevel?: number | null;
  openNow?: boolean | null;
  openingHours?: string[] | null;
};

/** Data-grounded badges only — every one below is computed straight from
 * this place's own real fetched fields, never a claim about popularity or
 * guest sentiment this app has no data for. */
export function computeSmartHighlights(insight: InsightForBadges | null | undefined): Badge[] {
  if (!insight) return [];
  const badges: Badge[] = [];

  if (insight.walkMinutes != null && insight.walkMinutes <= 15) badges.push({ icon: "🚶", label: "Walking Distance" });
  else if (insight.distanceMeters != null && insight.distanceMeters <= 1000) badges.push({ icon: "🚶", label: "Walking Distance" });

  if (insight.rating != null && insight.rating >= 4.5 && (insight.ratingCount ?? 0) >= 50) badges.push({ icon: "🏆", label: "Highly Rated" });

  if (insight.priceLevel != null && insight.priceLevel <= 1) badges.push({ icon: "💰", label: "Budget Friendly" });

  const is24h = insight.openingHours?.some((line) => line.includes("Open 24 hours")) ?? false;
  if (is24h) badges.push({ icon: "🌙", label: "Open 24 Hours" });

  if (insight.ratingCount != null && insight.ratingCount >= 1000) badges.push({ icon: "⭐", label: "Highly Reviewed" });

  return badges;
}
