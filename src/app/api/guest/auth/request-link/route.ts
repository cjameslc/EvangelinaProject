import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendGuestLoginEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Limit both by requester IP and by target email, so one client can't
  // spam a single inbox and one botnet-y IP can't spam many emails.
  const ipLimit = rateLimit(`guest-login-ip:${clientIp(req)}`, 10, 60 * 60 * 1000);
  const emailLimit = rateLimit(`guest-login-email:${email}`, 5, 60 * 60 * 1000);
  if (!ipLimit.ok || !emailLimit.ok) {
    // Same shape as the success response — still no enumeration signal.
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.guestLoginToken.create({ data: { email, token, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) } });

  const link = `${req.nextUrl.origin}/api/guest/auth/verify?token=${token}`;
  try {
    await sendGuestLoginEmail(email, link);
  } catch (e) {
    console.error("Failed to send guest login email", e);
  }

  // Same response regardless of send outcome — this endpoint must never be
  // usable to enumerate which emails have an account or to probe send failures.
  return NextResponse.json({ ok: true });
}
