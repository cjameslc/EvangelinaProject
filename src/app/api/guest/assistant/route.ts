import { NextRequest, NextResponse } from "next/server";
import { getCurrentGuest } from "@/lib/guestSession";
import { askAssistant } from "@/lib/ai/assistantService";

// Public — the assistant should answer general availability/rate questions
// for anyone browsing, not just signed-in guests. getCurrentGuest() being
// null just means booking-specific questions get told to sign in first
// (handled in the system prompt, see assistantService.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
  if (message.length > 1000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

  const guest = await getCurrentGuest();

  try {
    const { reply, escalate } = await askAssistant(guest?.id ?? null, message);
    return NextResponse.json({ reply, escalate });
  } catch (e) {
    console.error("Assistant error", e);
    return NextResponse.json(
      { reply: "Sorry, I'm having trouble right now — I've flagged this for our team.", escalate: true },
      { status: 200 }
    );
  }
}
