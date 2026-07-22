import { NextRequest, NextResponse } from "next/server";

// Facebook Messenger Platform webhook — this is what the Meta App Dashboard's
// "Configure webhooks" screen needs: a Callback URL (this route's full URL)
// and a Verify Token (MESSENGER_VERIFY_TOKEN below, set to the same value in
// both this app's env vars and that dashboard field).
//
// GET is Facebook's one-time verification handshake, done whenever the
// webhook is (re)subscribed: it sends hub.mode/hub.verify_token/hub.challenge
// and expects the challenge echoed back verbatim if the token matches.
//
// POST is every subsequent real event (messages, postbacks, delivery
// receipts, etc.) — logged only for now, no reply sent back yet. Sending a
// reply requires a Page Access Token (Send API), which isn't configured yet;
// wire that in once one exists. Facebook expects a 200 within ~20s or it
// retries/backs off, so this acks immediately rather than waiting on any
// processing.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.MESSENGER_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // eslint-disable-next-line no-console
  console.log("[messenger.webhook]", JSON.stringify(body));

  // Always 200 — Facebook only cares that the event was received, not what
  // (if anything) was done with it. Returning a non-200 makes it retry.
  return NextResponse.json({ received: true });
}
