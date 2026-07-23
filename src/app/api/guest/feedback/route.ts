import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { submitFeedback, LIKED_TAGS } from "@/lib/bookingEngine/feedbackService";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const guest = await getCurrentGuest();
  if (!guest) return new Response("Unauthorized", { status: 401 });

  const limited = rateLimit(`guest-feedback:${guest.id}`, 10, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
  if (!bookingId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });

  const validTagKeys = new Set<string>(LIKED_TAGS.map((t) => t.key));
  const likedTags = Array.isArray(body?.likedTags) ? body.likedTags.filter((t: unknown) => typeof t === "string" && validTagKeys.has(t)) : [];

  const result = await submitFeedback(guest.id, bookingId, {
    overallRating: Number(body?.overallRating),
    likedTags,
    improveComment: typeof body?.improveComment === "string" ? body.improveComment.slice(0, 1000) : null,
    wouldRecommend: body?.wouldRecommend,
    rewardType: body?.rewardType,
    contactName: typeof body?.contactName === "string" ? body.contactName.slice(0, 120) : "",
    contactPhone: typeof body?.contactPhone === "string" ? body.contactPhone.slice(0, 40) : "",
    contactEmail: typeof body?.contactEmail === "string" ? body.contactEmail.slice(0, 200) : null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, voucher: result.feedback }, { status: 201 });
}
