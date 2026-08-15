import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

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

/**
 * Verifies Meta's X-Hub-Signature-256 header — HMAC-SHA256 of the exact raw
 * request body, keyed with the Meta App Secret (a different credential
 * from MESSENGER_VERIFY_TOKEN above, which only guards the one-time GET
 * handshake). Without this, anyone who finds this URL could POST fabricated
 * events; today the blast radius is limited to poisoned server logs (no
 * reply/Send-API logic acts on the payload yet, per the comment above),
 * but this must be closed before that ships.
 *
 * MESSENGER_APP_SECRET isn't provisioned yet (not in this app's env vars
 * as of this fix) — rather than reject every real event the moment this
 * ships (which would silently break the webhook with no visibility until
 * someone checks logs), this fails open with a loud warning when the
 * secret is absent, and only starts actually rejecting once a real secret
 * is set. Get it from the Meta App Dashboard → Settings → Basic → App
 * Secret, and set MESSENGER_APP_SECRET in the environment to close this
 * for real.
 */
function isValidMessengerSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.MESSENGER_APP_SECRET;
  if (!appSecret) {
    // eslint-disable-next-line no-console
    console.warn("[messenger.webhook] MESSENGER_APP_SECRET is not set — skipping signature validation. This endpoint currently accepts unsigned requests.");
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidMessengerSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const body = (() => {
    try { return JSON.parse(rawBody); } catch { return null; }
  })();

  // eslint-disable-next-line no-console
  console.log("[messenger.webhook]", JSON.stringify(body));

  // Always 200 — Facebook only cares that the event was received, not what
  // (if anything) was done with it. Returning a non-200 makes it retry.
  return NextResponse.json({ received: true });
}
