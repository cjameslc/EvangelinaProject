import { Resend } from "resend";

// Guest-facing email only (magic-link login now; booking-confirmation/
// reminder emails plug into this same sender later via notificationService).
// Staff auth never sends email — this file has no bearing on staff login.
const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's free tier only delivers from a verified domain OR from
// onboarding@resend.dev to the Resend account's own email until a real
// sending domain is verified — expected during development, documented here
// so a "why didn't the guest get the email" report isn't a mystery later.
const FROM = process.env.RESEND_FROM_EMAIL || "Evangelina's Staycation <onboarding@resend.dev>";

export async function sendGuestLoginEmail(to: string, link: string) {
  return resend.emails.send({
    from: FROM,
    to,
    subject: "Your sign-in link — Evangelina's Staycation",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">Evangelina's Staycation</h2>
        <p>Tap the button below to sign in. This link works once and expires in 15 minutes.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#FF385C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in</a>
        </p>
        <p style="color:#767676;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
