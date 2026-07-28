// Curated caption/hashtag content for the Social Media Center — grounded in
// what this property actually is (a 5-unit short-term staycation rental in
// Cubao, Quezon City; Daycation/Night/Full-stay bookings via TikTok, Airbnb,
// Facebook, Direct) rather than generic event-venue marketing copy. Template
// strings use {MONTH}/{DATES}/{CONTACT}/{UNIT} placeholders, filled in by
// the caller with real, current data — never fabricated specifics.

export type CaptionCategory = {
  id: string;
  label: string;
  emoji: string;
  description: string;
};

export const CAPTION_CATEGORIES: CaptionCategory[] = [
  { id: "available_dates", label: "Available Dates", emoji: "📅", description: "This month's open slots" },
  { id: "fully_booked", label: "Fully Booked", emoji: "🔒", description: "Announce a sold-out stretch" },
  { id: "last_minute", label: "Last-Minute Availability", emoji: "⚡", description: "A slot just opened up" },
  { id: "weekend_promo", label: "Weekend Promo", emoji: "🌴", description: "Push the upcoming weekend" },
  { id: "holiday_promo", label: "Holiday / Seasonal Promo", emoji: "🎉", description: "Tie into a holiday or season" },
  { id: "birthday", label: "Birthday Staycation", emoji: "🎂", description: "Guests celebrating a birthday" },
  { id: "barkada", label: "Barkada / Friends Hangout", emoji: "👯", description: "Group getaway angle" },
  { id: "family", label: "Family Getaway", emoji: "👨‍👩‍👧‍👦", description: "Family bonding angle" },
  { id: "couples", label: "Couple's Getaway", emoji: "💑", description: "Romantic staycation angle" },
  { id: "testimonial", label: "Testimonial", emoji: "⭐", description: "Feature a happy guest" },
  { id: "thank_you", label: "Thank You Post", emoji: "🙏", description: "Appreciation post for guests/followers" },
];

export type CaptionTemplate = {
  id: string;
  categoryId: string;
  headline: string;
  caption: string;
  cta: string;
};

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "avail-1", categoryId: "available_dates",
    headline: "🎉 Available Dates for {MONTH}!",
    caption: "Planning a staycation, family bonding, or a barkada getaway? We've got open slots this {MONTH} across our units in Cubao, Quezon City.\n\n📅 {DATES}\n\nDaycation, overnight, or full-day stays available.",
    cta: "📩 Message us today to reserve your date — {CONTACT}",
  },
  {
    id: "avail-2", categoryId: "available_dates",
    headline: "Still open this {MONTH} 👀",
    caption: "A few dates are still free this {MONTH} — first come, first served.\n\n📅 {DATES}",
    cta: "DM us or message {CONTACT} to lock in your date.",
  },
  {
    id: "full-1", categoryId: "fully_booked",
    headline: "We're fully booked! 🔒",
    caption: "Thank you for the love — {DATES} is completely booked out this {MONTH}. If you've been eyeing a date, don't wait for next time.",
    cta: "📩 Message {CONTACT} to get on our waitlist for cancellations.",
  },
  {
    id: "last-1", categoryId: "last_minute",
    headline: "⚡ Last slot just opened!",
    caption: "A date just freed up — {DATES}. This won't last, someone's been eyeing it already.",
    cta: "First to message {CONTACT} gets it. 📩",
  },
  {
    id: "weekend-1", categoryId: "weekend_promo",
    headline: "🌴 This weekend's still open!",
    caption: "No plans yet this weekend? We've got units open for a quick daycation or overnight escape — no need to travel far.",
    cta: "📩 Message {CONTACT} to book before the weekend fills up.",
  },
  {
    id: "holiday-1", categoryId: "holiday_promo",
    headline: "🎉 {MONTH} calls for a celebration!",
    caption: "Make this {MONTH} memorable — gather the family or barkada for a staycation to remember. Limited dates available.",
    cta: "📩 Reserve now — {CONTACT}",
  },
  {
    id: "bday-1", categoryId: "birthday",
    headline: "🎂 Celebrating a birthday soon?",
    caption: "Skip the crowded restaurant — celebrate in a space that's all yours for the day. Perfect for a small birthday gathering with the people who matter.",
    cta: "📩 Message {CONTACT} to check available dates.",
  },
  {
    id: "barkada-1", categoryId: "barkada",
    headline: "👯 Barkada trip, sorted.",
    caption: "No need to drive far — gather the barkada for a staycation right here in Cubao. Games, good food, better company.",
    cta: "📩 Message {CONTACT} to reserve your date.",
  },
  {
    id: "family-1", categoryId: "family",
    headline: "👨‍👩‍👧‍👦 Family bonding, made easy",
    caption: "A weekend away from screens and errands — just family time. Our units are ready whenever you are.",
    cta: "📩 Book your family getaway — {CONTACT}",
  },
  {
    id: "couples-1", categoryId: "couples",
    headline: "💑 A little escape, just the two of you",
    caption: "Sometimes you just need a change of scenery. Cozy, private, and close by.",
    cta: "📩 Message {CONTACT} to reserve.",
  },
  {
    id: "testimonial-1", categoryId: "testimonial",
    headline: "⭐ Another happy stay!",
    caption: "\"[Guest quote goes here]\" — thank you for choosing us! Reviews like this are why we do what we do.",
    cta: "📩 Book your own stay — {CONTACT}",
  },
  {
    id: "thanks-1", categoryId: "thank_you",
    headline: "🙏 Thank you!",
    caption: "To everyone who's stayed with us, recommended us, or just followed along — thank you. We're grateful for every single one of you.",
    cta: "More dates opening up soon — stay tuned!",
  },
];

// Base hashtag sets — combined at render time with a location tag (from
// Settings.address) and a month tag, never hardcoded to a specific date.
export const HASHTAG_BASE = ["#EvangelinasStaycation", "#StaycationPH", "#CubaoStaycation", "#QCStaycation", "#PrivatePoolStaycation"];
export const HASHTAG_BY_CATEGORY: Record<string, string[]> = {
  available_dates: ["#BookNow", "#AvailableDates", "#StaycationDeals"],
  fully_booked: ["#FullyBooked", "#SoldOut", "#WaitlistOpen"],
  last_minute: ["#LastMinuteDeal", "#LastSlot", "#BookToday"],
  weekend_promo: ["#WeekendGetaway", "#WeekendVibes", "#GantiWeekend"],
  holiday_promo: ["#HolidayStaycation", "#SeasonalDeal"],
  birthday: ["#BirthdayStaycation", "#BdayCelebration"],
  barkada: ["#BarkadaTrip", "#BarkadaGetaway", "#SquadGoals"],
  family: ["#FamilyStaycation", "#FamilyBonding", "#FamilyTime"],
  couples: ["#CouplesGetaway", "#DateNight", "#RomanticStaycation"],
  testimonial: ["#HappyGuests", "#GuestReview", "#Testimonial"],
  thank_you: ["#ThankYou", "#Grateful"],
};

export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export function buildHashtags(categoryId: string, month: string, location: string): string[] {
  const locationTag = "#" + location.replace(/[^a-zA-Z0-9]/g, "");
  const monthTag = "#" + month.replace(/\s/g, "");
  return [...HASHTAG_BASE, ...(HASHTAG_BY_CATEGORY[categoryId] ?? []), locationTag, monthTag];
}

/**
 * Purely formulaic — every value here is a real, already-known fact, so
 * this is a template, not an AI call. Produces a prompt for pasting into
 * whatever external AI image tool the user already has (Midjourney, Canva
 * AI, etc.) alongside the unit's real photo — this app doesn't generate
 * images itself, only the instructions for one that does.
 */
export function buildImagePrompt(opts: { unitName: string; dateLines: string[]; businessName: string; hasPhoto: boolean }): string {
  const datesPart = opts.dateLines.length ? opts.dateLines.join(" & ") : "the open dates listed on the post";
  const photoPart = opts.hasPhoto
    ? `Use the actual ${opts.unitName} photo (attached) as the background`
    : `Use a warm, realistic staycation-unit interior as the background (no real photo attached for this unit yet)`;
  return `Create a premium Airbnb-style promotional image for ${opts.businessName}. ${photoPart}. Add elegant, legible typography with the title "Staycation Available", prominently display the available dates (${datesPart}) and the unit name "${opts.unitName}", use warm inviting lighting, a luxury-hospitality aesthetic, and include a subtle "Book Now" call-to-action in the corner.`;
}
