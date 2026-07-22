import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { askAssistant } from "@/lib/ai/assistantService";
import { rateLimit, clientIp } from "@/lib/rateLimit";

// Public — the assistant should answer general availability/rate questions
// for anyone browsing, not just signed-in guests. getCurrentGuest() being
// null just means booking-specific questions get told to sign in first
// (handled in the system prompt, see assistantService.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  if (message.length > 1000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

  // Client-maintained turn history (the widget's own prior messages) — capped
  // both in length and per-turn size so a manipulated/huge payload can't
  // blow up the Gemini request. Malformed entries are dropped, not rejected
  // outright, so one bad turn doesn't kill an otherwise-fine conversation.
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history = rawHistory
    .slice(-20)
    .filter((t: any) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string" && t.text.length > 0)
    .map((t: any) => ({ role: t.role, text: t.text.slice(0, 1000) }));

  const guest = await getCurrentGuest();

  // No auth is required for this endpoint, so it's the one place in the
  // guest surface that's directly exposed to unlimited Gemini API cost —
  // cap it per requester (guest id when signed in, else IP).
  const limitKey = guest ? `assistant-guest:${guest.id}` : `assistant-ip:${clientIp(req)}`;
  if (!rateLimit(limitKey, 20, 5 * 60 * 1000).ok) {
    return NextResponse.json(
      { reply: "You're sending messages a bit fast — please wait a moment and try again.", escalate: false },
      { status: 200 }
    );
  }

  try {
    const { reply, escalate } = await askAssistant(guest?.id ?? null, message, history);
    return NextResponse.json({ reply, escalate });
  } catch (e) {
    console.error("Assistant error", e);
    return NextResponse.json(
      { reply: "Sorry, I'm having trouble right now — I've flagged this for our team.", escalate: true },
      { status: 200 }
    );
  }
}
