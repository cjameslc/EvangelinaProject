// Central tile/navigation config for the Guest Experience hub (src/app/page.tsx
// + src/components/guest/GuideHubView.tsx) and its dedicated /guide/* pages.
// Kept as plain data (not JSX) so both the hub grid and any future
// breadcrumb/search UI can read the same list without duplicating it.

import { GALLERY } from "@/lib/galleryContent";

export type GuideTile = {
  key: string;
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  image?: string;
  /** Shows real per-unit secrets (WiFi/door code) only to a guest with an
   * active booking — see getActiveGuideBooking in guestService.ts. */
  secure?: boolean;
};

export const GUIDE_TILES: GuideTile[] = [
  { key: "welcome", href: "/guide/welcome", icon: "🏠", title: "Welcome", subtitle: "Start here", image: GALLERY.hero[0].src },
  { key: "house-manual", href: "/guide/house-manual", icon: "📖", title: "House Manual", subtitle: "Rates, parking, house rules & building facilities", image: GALLERY["living-room"][0].src },
  { key: "amenities", href: "/guide/amenities", icon: "🛏️", title: "Amenities", subtitle: "What's in your unit", image: GALLERY.amenities[0].src },
  { key: "wifi", href: "/guide/wifi", icon: "📶", title: "WiFi", subtitle: "Get connected", image: GALLERY.wifi[0].src, secure: true },
  { key: "check-in", href: "/guide/check-in", icon: "🔑", title: "Check-In Guide", subtitle: "How to get in", image: GALLERY.checkin[0].src, secure: true },
  { key: "check-out", href: "/guide/check-out", icon: "✅", title: "Checkout Guide", subtitle: "Before you leave", image: GALLERY.bathroom[0].src, secure: true },
  { key: "location", href: "/guide/location", icon: "📍", title: "Location", subtitle: "Find your way here", image: GALLERY.building[0].src },
  { key: "nearby-food", href: "/guide/nearby/food", icon: "🍽️", title: "Nearby Food", subtitle: "Restaurants around Cubao" },
  { key: "nearby-coffee", href: "/guide/nearby/coffee", icon: "☕", title: "Coffee Shops", subtitle: "Nearby cafés" },
  { key: "nearby-grocery", href: "/guide/nearby/grocery", icon: "🛒", title: "Grocery", subtitle: "Where to stock up" },
  { key: "transportation", href: "/guide/nearby/transportation", icon: "🚆", title: "Transportation", subtitle: "Getting around" },
  { key: "gallery", href: "/guide/gallery", icon: "📷", title: "Gallery", subtitle: "Photo tour", image: GALLERY["bedroom"][0].src },
  { key: "reviews", href: "/guide/reviews", icon: "⭐", title: "Guest Reviews", subtitle: "What guests say" },
  { key: "faqs", href: "/guide/faqs", icon: "❓", title: "FAQs", subtitle: "Common questions" },
  { key: "contact", href: "/guide/contact", icon: "📞", title: "Contact Host", subtitle: "Get in touch" },
  { key: "emergency", href: "/guide/emergency", icon: "🚨", title: "Emergency", subtitle: "Help when you need it" },
];

export type NearbySlug = "food" | "coffee" | "grocery" | "transportation";

export const NEARBY_SLUGS: Record<NearbySlug, { label: string; icon: string; categoryKeys: string[] }> = {
  food: { label: "Nearby Food", icon: "🍽️", categoryKeys: ["restaurants", "fastfood"] },
  coffee: { label: "Coffee Shops", icon: "☕", categoryKeys: ["coffee"] },
  grocery: { label: "Grocery", icon: "🛒", categoryKeys: ["grocery", "convenience"] },
  transportation: { label: "Transportation", icon: "🚆", categoryKeys: ["transportation"] },
};
