import { put } from "@vercel/blob";

// Housekeeping photos are the one image field in this app NOT stored as
// base64-in-DB — every other photo field (Booking proof, Bill receipts,
// AuditFinding photos, avatars) has caused a real page-payload bloat
// incident at some point this app's life; a brand-new, taken-every-day
// photo feature starts on real object storage instead.
export async function uploadHousekeepingPhoto(file: File, unitId: string) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `housekeeping/${unitId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}
