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

// Same reasoning as housekeeping photos above — a guest-uploaded payment
// screenshot is exactly the kind of image field that's caused real
// page-bloat problems elsewhere in this app when stored as base64. Real
// object storage from day one.
export async function uploadGuestPaymentProof(file: File, bookingId: string) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `guest-payments/${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Same reasoning again — a "report an issue" photo (a broken fixture, a
// mess, damage) is real object storage from day one, not base64-in-DB.
export async function uploadGuestRequestPhoto(file: File, bookingId: string) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `guest-requests/${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Chat image attachments — same reasoning as every other photo field above.
export async function uploadChatImage(file: File, conversationId: string) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `chat/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}
