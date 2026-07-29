// Guest Feedback & Rewards — pure content/config, zero server dependencies
// (no prisma import) so client components (FeedbackFormView, FeedbackTab)
// can safely import from here. feedbackService.ts (prisma-backed, server
// only) re-exports these for its own use — same split as
// guidebookContent.ts (client-safe) vs guidebookService.ts (server-only).

export const LIKED_TAGS = [
  { key: "clean_room", label: "Clean Room" },
  { key: "comfortable_bed", label: "Comfortable Bed" },
  { key: "fast_wifi", label: "Fast WiFi" },
  { key: "entertainment", label: "Netflix & Entertainment" },
  { key: "friendly_staff", label: "Friendly Staff" },
  { key: "easy_checkin", label: "Easy Check-in" },
  { key: "great_location", label: "Great Location" },
  { key: "value_for_money", label: "Value for Money" },
  { key: "amenities", label: "Amenities" },
  { key: "overall_experience", label: "Overall Experience" },
] as const;

export const REWARD_OPTIONS = [
  { key: "discount", icon: "🎟️", label: "₱100 OFF on your next stay", note: null as string | null },
  { key: "late_checkout", icon: "🕒", label: "Free 1-Hour Late Checkout", note: "Subject to availability" },
  { key: "coffee", icon: "☕", label: "Free Premium Coffee", note: null },
] as const;
export type RewardKey = (typeof REWARD_OPTIONS)[number]["key"];

export const RECOMMEND_OPTIONS = [
  { key: "definitely", icon: "❤️", label: "Definitely" },
  { key: "probably", icon: "👍", label: "Probably" },
  { key: "maybe", icon: "🤔", label: "Maybe" },
  { key: "no", icon: "👎", label: "No" },
] as const;
export type RecommendKey = (typeof RECOMMEND_OPTIONS)[number]["key"];
