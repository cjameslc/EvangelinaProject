import { NextRequest, NextResponse } from "next/server";
import { trackDownload } from "@/lib/unsplash/client";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/**
 * Unsplash API guideline compliance: pinged once per image, client-side,
 * the moment that specific image is actually rendered to a guest — see
 * useUnsplashTracking. Deliberately NOT called during cache-warming (see
 * service.ts's refreshCategory comment for why that was a real bug).
 *
 * downloadLocation is just an api.unsplash.com URL (useless without the
 * access key, which stays server-only and is attached here) — safe to
 * have passed down to the client. Validated to actually be an Unsplash
 * URL so this can't be abused as an open fetch proxy.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(`unsplash-track:${clientIp(req)}`, 60, 60 * 1000);
  if (!limited.ok) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const downloadLocation = typeof body?.downloadLocation === "string" ? body.downloadLocation : "";
  if (!downloadLocation.startsWith("https://api.unsplash.com/")) {
    return NextResponse.json({ error: "Invalid downloadLocation" }, { status: 400 });
  }

  await trackDownload(downloadLocation);
  return NextResponse.json({ ok: true });
}
