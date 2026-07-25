import { NextRequest } from "next/server";

// Google's classic Place Photo endpoint needs the server-only Places key —
// this route is the only thing that ever calls it, so that key never
// reaches the browser (the Maps JavaScript API key exposed client-side for
// the interactive map is a deliberately separate, referrer-restrictable
// key — see NearbyMap.tsx). `ref` is Google's own opaque photo_reference
// token, never a user-supplied URL, so there's no SSRF surface here beyond
// this one fixed upstream host.
const PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const MAX_WIDTH = 1200;
// Google's photo_reference tokens are long base64url-ish strings — this is
// a defensive shape check, not a real allowlist (the value only ever goes
// into a query param against a fixed host, never interpolated into a path
// or command), so it just rejects obviously-malformed input early.
const REF_PATTERN = /^[A-Za-z0-9_-]{20,4096}$/;

export async function GET(req: NextRequest) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return new Response("Not configured", { status: 503 });

  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!REF_PATTERN.test(ref)) return new Response("Invalid photo reference", { status: 400 });

  const width = Math.min(MAX_WIDTH, Math.max(100, Number(req.nextUrl.searchParams.get("w")) || 800));

  const upstream = new URL(PHOTO_URL);
  upstream.searchParams.set("maxwidth", String(width));
  upstream.searchParams.set("photo_reference", ref);
  upstream.searchParams.set("key", apiKey);

  try {
    // 8s cap — this runs on real guest page loads (unlike the admin-only
    // refresh flow), so a hung upstream call must fail fast into the same
    // "Photo unavailable" response the guest already sees for a real 502,
    // rather than tying up the function for its full duration budget.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(upstream, { redirect: "follow", signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok || !res.body) return new Response("Photo unavailable", { status: 502 });
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
        // A given photo_reference's image is stable — safe to cache hard,
        // and doing so is what keeps repeat guest page views from
        // re-billing Google for the same photo.
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 502 });
  }
}
