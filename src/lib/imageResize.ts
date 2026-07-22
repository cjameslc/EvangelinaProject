// Client-only helper. Payment-screenshot uploads (GCash/bank-app captures,
// sometimes full-resolution phone photos) are frequently far larger than
// needed to stay legible — resizing before upload cuts three costs at
// once: upload bandwidth, Vercel Blob storage, and Gemini vision token
// usage (which scales with image resolution). 1280px on the long edge is
// comfortably enough to keep receipt text readable.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

export async function resizeImageForUpload(file: File): Promise<File> {
  // GIFs would lose animation (irrelevant here, but also just skip anything
  // already small enough — no point re-encoding a screenshot that's
  // already under the target size).
  if (file.type === "image/gif" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // resize didn't actually help — keep the original

    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    // Never block an upload on a resize failure — fall back to the original.
    return file;
  }
}
