// Central tile/navigation config for the Guest Experience hub (src/app/page.tsx
// + src/components/guest/GuideHubView.tsx) and its dedicated /guide/* pages.
// Kept as plain data (not JSX) so both the hub grid and any future
// breadcrumb/search UI can read the same list without duplicating it.

import { GALLERY } from "@/lib/galleryContent";

/** Generated cover-art config for sections with no real photo (nearby
 * places, reviews, FAQs, contact, emergency) — see TileCoverArt.tsx. A
 * gradient + a scattered icon motif, deliberately not a fabricated photo
 * of a real place (this app has no image-generation model access, and
 * wouldn't invent one even if it did) — just a designed, on-brand graphic
 * so every tile in the grid feels equally finished. Keyed once here so the
 * hub tile and that section's own page header always match exactly.
 */
export type TileArt = { gradient: [string, string]; pattern: string };
export const CATEGORY_ART: Record<string, TileArt> = {
  food: { gradient: ["#FF7A5C", "#E23B57"], pattern: "🍜" },
  coffee: { gradient: ["#8B5E3C", "#4A2E1E"], pattern: "☕" },
  grocery: { gradient: ["#3EA66B", "#1C6E45"], pattern: "🥬" },
  transportation: { gradient: ["#3B82C4", "#1E4E8C"], pattern: "🚏" },
  reviews: { gradient: ["#F5A623", "#D97706"], pattern: "⭐" },
  faqs: { gradient: ["#7C6CE8", "#4C3FB0"], pattern: "❓" },
  contact: { gradient: ["#FF385C", "#B01E3F"], pattern: "💬" },
  emergency: { gradient: ["#E5484D", "#9E1F23"], pattern: "🚨" },
};

export type GuideTile = {
  key: string;
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  image?: string;
  art?: TileArt;
  /** Shows real per-unit secrets (WiFi/door code) only to a guest with an
   * active booking — see getActiveGuideBooking in guestService.ts. */
  secure?: boolean;
};

export type GuideSection = { label: string; tiles: GuideTile[] };

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    label: "Get started",
    tiles: [
      { key: "welcome", href: "/guide/welcome", icon: "🏠", title: "Welcome", subtitle: "Start here", image: GALLERY.hero[0].src },
      { key: "wifi", href: "/guide/wifi", icon: "📶", title: "WiFi", subtitle: "Get connected", image: GALLERY.wifi[0].src, secure: true },
      { key: "check-in", href: "/guide/check-in", icon: "🔑", title: "Check-In Guide", subtitle: "How to get in", image: GALLERY.checkin[0].src, secure: true },
      { key: "location", href: "/guide/location", icon: "📍", title: "Location", subtitle: "Find your way here", image: GALLERY.building[0].src },
    ],
  },
  {
    label: "Your stay",
    tiles: [
      { key: "house-manual", href: "/guide/house-manual", icon: "📖", title: "House Manual", subtitle: "Rates, parking, house rules & building facilities", image: GALLERY["living-room"][0].src },
      { key: "amenities", href: "/guide/amenities", icon: "🛏️", title: "Amenities", subtitle: "What's in your unit", image: GALLERY.amenities[0].src },
      { key: "gallery", href: "/guide/gallery", icon: "📷", title: "Gallery", subtitle: "Photo tour", image: GALLERY["bedroom"][0].src },
      { key: "check-out", href: "/guide/check-out", icon: "✅", title: "Checkout Guide", subtitle: "Before you leave", image: GALLERY.bathroom[0].src, secure: true },
    ],
  },
  {
    label: "Explore the neighborhood",
    tiles: [
      { key: "nearby-food", href: "/guide/nearby/food", icon: "🍽️", title: "Nearby Food", subtitle: "Restaurants around Cubao", art: CATEGORY_ART.food },
      { key: "nearby-coffee", href: "/guide/nearby/coffee", icon: "☕", title: "Coffee Shops", subtitle: "Nearby cafés", art: CATEGORY_ART.coffee },
      { key: "nearby-grocery", href: "/guide/nearby/grocery", icon: "🛒", title: "Grocery", subtitle: "Where to stock up", art: CATEGORY_ART.grocery },
      { key: "transportation", href: "/guide/nearby/transportation", icon: "🚆", title: "Transportation", subtitle: "Getting around", art: CATEGORY_ART.transportation },
    ],
  },
  {
    label: "Support",
    tiles: [
      { key: "reviews", href: "/guide/reviews", icon: "⭐", title: "Guest Reviews", subtitle: "What guests say", art: CATEGORY_ART.reviews },
      { key: "faqs", href: "/guide/faqs", icon: "❓", title: "FAQs", subtitle: "Common questions", art: CATEGORY_ART.faqs },
      { key: "contact", href: "/guide/contact", icon: "📞", title: "Contact Host", subtitle: "Get in touch", art: CATEGORY_ART.contact },
      { key: "emergency", href: "/guide/emergency", icon: "🚨", title: "Emergency", subtitle: "Help when you need it", art: CATEGORY_ART.emergency },
    ],
  },
];

/** Flat list — kept for anything that just needs "every tile" (e.g. a
 * future search index) without caring about section grouping. */
export const GUIDE_TILES: GuideTile[] = GUIDE_SECTIONS.flatMap((s) => s.tiles);

export type NearbySlug = "food" | "coffee" | "grocery" | "transportation";

export const NEARBY_SLUGS: Record<NearbySlug, { label: string; icon: string; categoryKeys: string[]; art: TileArt }> = {
  food: { label: "Nearby Food", icon: "🍽️", categoryKeys: ["restaurants", "fastfood"], art: CATEGORY_ART.food },
  coffee: { label: "Coffee Shops", icon: "☕", categoryKeys: ["coffee"], art: CATEGORY_ART.coffee },
  grocery: { label: "Grocery", icon: "🛒", categoryKeys: ["grocery", "convenience"], art: CATEGORY_ART.grocery },
  transportation: { label: "Transportation", icon: "🚆", categoryKeys: ["transportation"], art: CATEGORY_ART.transportation },
};
