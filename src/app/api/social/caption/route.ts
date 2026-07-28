import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/session";
import { canSeeSocialMedia } from "@/lib/rbac";
import { generateCaption, type CaptionGenInput } from "@/lib/ai/captionGenerator";
import { rateLimit } from "@/lib/rateLimit";

// Cached per exact input (unstable_cache keys off the function's arguments)
// — the same category+month+availability combo never re-hits Gemini, real
// changes to the underlying data naturally bust the cache. Same pattern as
// /api/dashboard/insight.
const getCachedCaption = unstable_cache(
  (input: CaptionGenInput) => generateCaption(input),
  ["social-caption"],
  { revalidate: 600 }
);

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeSocialMedia(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`social-caption:${user.id}`, 20, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const input = await req.json().catch(() => null) as CaptionGenInput | null;
  if (!input || typeof input !== "object" || !input.categoryLabel || !input.month) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await getCachedCaption(input);
    return NextResponse.json(result);
  } catch (e: any) {
    // Unlike the Dashboard insight (a cosmetic upgrade over a solid
    // template), the caption library IS the feature here — a Gemini
    // failure needs to surface so the UI can tell the user to fall back to
    // the template library, not silently return nothing.
    return NextResponse.json({ error: e?.message ?? "Couldn't generate a caption right now." }, { status: 502 });
  }
}
