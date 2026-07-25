// Shared between the reactions API route (server-side allowlist) and the
// composer's emoji picker (client-side), so the two can never drift.
export const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "👏", "🔥", "🏡", "🧹", "✅", "❗", "📌"] as const;

export const STATUS_LABEL: Record<string, string> = {
  ONLINE: "Online",
  BUSY: "Busy",
  AWAY: "Away",
  DND: "Do Not Disturb",
  MEETING: "In a Meeting",
  OFFLINE: "Offline",
};

export const STATUS_COLOR: Record<string, string> = {
  ONLINE: "#22C55E", // green
  BUSY: "#F59E0B", // amber
  AWAY: "#3B82F6", // blue
  DND: "#EF4444", // red
  MEETING: "#8B5CF6", // violet
  OFFLINE: "#9CA3AF", // gray
};

export const MANUAL_STATUSES = ["BUSY", "AWAY", "DND", "MEETING"] as const;

export const ANNOUNCEMENT_LABEL: Record<string, string> = {
  ANNOUNCEMENT: "Announcement",
  URGENT: "Urgent Notice",
  MAINTENANCE: "Maintenance Alert",
  POLICY: "Policy Update",
};
