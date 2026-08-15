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

// Unit listing photo — was base64-in-DB until it turned out to be a real
// Fast Origin Transfer cost: every guest who opens the public /book page
// or a listing detail re-downloads all 5 units' full photo bytes from the
// origin on every single visit, since nothing in this app is ever
// edge-cached. Real object storage, same reasoning as every other photo
// field above.
export async function uploadUnitPhoto(file: File) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `units/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Staff profile avatar — was base64-in-DB, up to several MB each. Bulk
// reads (Admin's Users tab, every /admin load) shipped every active user's
// full photo bytes on every visit — the same class of Fast Origin Transfer
// cost as Unit.photoUrl, just staff-facing instead of guest-facing. Real
// object storage means these bulk reads can keep selecting avatarUrl
// directly (a cheap URL string) instead of needing the proxy-endpoint
// pattern chat/avatars.ts uses for the still-base64 legacy rows.
export async function uploadUserAvatar(file: File) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Bill payment receipt photo — was base64-in-DB (currently 0 real rows in
// production, but the upload path still wrote raw bytes, so this would
// have become the next Fast Origin Transfer incident the moment staff
// started attaching receipts). Real object storage from the start, same
// reasoning as every other photo field above.
export async function uploadBillReceipt(file: File, billId: string) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `bills/${billId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Settings host photo — one singleton (Settings.hostPhotoUrl), same
// reasoning as every other photo field above.
export async function uploadHostPhoto(file: File) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `settings/host-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Guest payment QR code (Settings.paymentQrUrl) — keyed by ownerId (unlike
// uploadHostPhoto above, a pre-existing gap not worth touching in passing)
// since this one's added fresh with the per-owner Settings model already
// in place.
export async function uploadPaymentQr(file: File, ownerId: string) {
  const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
  const key = `settings/payment-qr/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Auditor finding photo — same reasoning as every other photo field above.
export async function uploadAuditFindingPhoto(file: File) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `audit-findings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Expense-request receipt — submitted alongside a brand-new ExpenseRequest
// that doesn't have an id yet, so no entity-id segment in the key (same
// shape as uploadBrandLogo below). Same reasoning as every other photo
// field above.
export async function uploadExpenseReceipt(file: File) {
  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
  const key = `expense-receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Brand Kit logo — one singleton logo, not per-entity, so no id segment in
// the key. Real object storage, not base64-in-DB, same reasoning as every
// other photo field above (and unlike Settings.hostPhotoUrl, which still
// uses the older base64 pattern this app's own comments call out as an
// anti-pattern to avoid for new image fields).
export async function uploadBrandLogo(file: File) {
  const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
  const key = `branding/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}

// Per-tenant Owner.logoUrl — the icon shown in the staff nav for that
// owner's own account, distinct from Settings.logoUrl/uploadBrandLogo above
// (which is Evangelina's global Social Media Center export asset, not
// per-owner). ownerId is optional because Platform Admin uploads this
// during owner creation, before the Owner row exists yet.
export async function uploadOwnerLogo(file: File, ownerId?: string) {
  const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
  const key = `owner-branding/${ownerId ?? "pending"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const blob = await put(key, file, { access: "public", addRandomSuffix: false });
  return blob.url;
}
