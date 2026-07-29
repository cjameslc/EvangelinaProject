// Central tile/navigation config for the Guest Experience hub (src/app/page.tsx
// + src/components/guest/GuideHubView.tsx) and its dedicated /guide/* pages.
// Kept as plain data (not JSX) so both the hub grid and any future
// breadcrumb/search UI can read the same list without duplicating it.

import { GALLERY } from "@/lib/galleryContent";

/** Cover photos for sections that aren't a real room but do have a real
 * (business-supplied, non-watermarked) photo — resized/optimized copies
 * live in public/gallery/category-*.jpg. */
export const CATEGORY_COVER_PHOTOS: Record<string, string> = {
  food: "/gallery/category-food.jpg",
  coffee: "/gallery/category-coffee.jpg",
  grocery: "/gallery/category-grocery.jpg",
  transportation: "/gallery/category-transportation.jpg",
  emergency: "/gallery/category-emergency.jpg",
  reviews: "/gallery/category-reviews.jpg",
  faqs: "/gallery/category-faqs.jpg",
  contact: "/gallery/category-contact.jpg",
};

/** Generated cover-art fallback for a section with no real photo at all —
 * see TileCoverArt.tsx. A gradient + a scattered icon motif, deliberately
 * not a fabricated photo of a real place — just a designed, on-brand
 * graphic so the tile still feels finished. Nothing uses this today (every
 * section now has a real photo), kept ready in case a future category
 * doesn't. */
export type TileArt = { gradient: [string, string]; pattern: string };

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
      { key: "nearby-food", href: "/guide/nearby/food", icon: "🍽️", title: "Nearby Food", subtitle: "Restaurants around Cubao", image: CATEGORY_COVER_PHOTOS.food },
      { key: "nearby-coffee", href: "/guide/nearby/coffee", icon: "☕", title: "Coffee Shops", subtitle: "Nearby cafés", image: CATEGORY_COVER_PHOTOS.coffee },
      { key: "nearby-grocery", href: "/guide/nearby/grocery", icon: "🛒", title: "Grocery", subtitle: "Where to stock up", image: CATEGORY_COVER_PHOTOS.grocery },
      { key: "transportation", href: "/guide/nearby/transportation", icon: "🚆", title: "Transportation", subtitle: "Getting around", image: CATEGORY_COVER_PHOTOS.transportation },
      { key: "nearby-hospitals", href: "/guide/nearby/hospitals", icon: "🏥", title: "Hospitals", subtitle: "Nearest medical care", art: { gradient: ["#B3261E", "#7A1913"], pattern: "🏥" } },
      { key: "nearby-schools", href: "/guide/nearby/schools", icon: "🎓", title: "Schools", subtitle: "Universities & colleges nearby", art: { gradient: ["#1E4FB3", "#0B2A6B"], pattern: "🎓" } },
      { key: "nearby-nightlife", href: "/guide/nearby/nightlife", icon: "🌃", title: "Nightlife", subtitle: "Bars, karaoke & entertainment", art: { gradient: ["#6B1FB3", "#2E0B6B"], pattern: "🌃" } },
      { key: "nearby-concert", href: "/guide/nearby/concert", icon: "🎤", title: "Concerts & Theater", subtitle: "Smart Araneta Coliseum & more", art: { gradient: ["#0B1E3D", "#C9A24B"], pattern: "🎤" } },
    ],
  },
  {
    label: "Support",
    tiles: [
      { key: "reviews", href: "/guide/reviews", icon: "⭐", title: "Guest Reviews", subtitle: "What guests say", image: CATEGORY_COVER_PHOTOS.reviews },
      { key: "faqs", href: "/guide/faqs", icon: "❓", title: "FAQs", subtitle: "Common questions", image: CATEGORY_COVER_PHOTOS.faqs },
      { key: "contact", href: "/guide/contact", icon: "📞", title: "Contact Host", subtitle: "Get in touch", image: CATEGORY_COVER_PHOTOS.contact },
      { key: "emergency", href: "/guide/emergency", icon: "🚨", title: "Emergency", subtitle: "Help when you need it", image: CATEGORY_COVER_PHOTOS.emergency },
    ],
  },
];

export type NearbySlug = "food" | "coffee" | "grocery" | "transportation" | "hospitals" | "schools" | "nightlife" | "concert";

export const NEARBY_SLUGS: Record<NearbySlug, { label: string; icon: string; categoryKeys: string[]; image?: string; art?: TileArt }> = {
  food: { label: "Nearby Food", icon: "🍽️", categoryKeys: ["restaurants", "fastfood"], image: CATEGORY_COVER_PHOTOS.food },
  coffee: { label: "Coffee Shops", icon: "☕", categoryKeys: ["coffee"], image: CATEGORY_COVER_PHOTOS.coffee },
  grocery: { label: "Grocery", icon: "🛒", categoryKeys: ["grocery", "convenience"], image: CATEGORY_COVER_PHOTOS.grocery },
  transportation: { label: "Transportation", icon: "🚆", categoryKeys: ["transportation"], image: CATEGORY_COVER_PHOTOS.transportation },
  hospitals: { label: "Hospitals", icon: "🏥", categoryKeys: ["hospitals"], art: { gradient: ["#B3261E", "#7A1913"], pattern: "🏥" } },
  schools: { label: "Schools", icon: "🎓", categoryKeys: ["schools"], art: { gradient: ["#1E4FB3", "#0B2A6B"], pattern: "🎓" } },
  nightlife: { label: "Nightlife", icon: "🌃", categoryKeys: ["entertainment"], art: { gradient: ["#6B1FB3", "#2E0B6B"], pattern: "🌃" } },
  concert: { label: "Concerts & Theater", icon: "🎤", categoryKeys: ["attractions"], art: { gradient: ["#0B1E3D", "#C9A24B"], pattern: "🎤" } },
};
