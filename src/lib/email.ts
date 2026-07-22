import { Resend } from "resend";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";

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

export type BookingConfirmationDetails = {
  guestName: string;
  unitName: string;
  confirmationNumber: string;
  date: string;
  stayType: string;
  total: number;
  paymentType: string;
  dpAmount: number;
  balanceDue: number;
};

export async function sendBookingConfirmationEmail(to: string, b: BookingConfirmationDetails) {
  const stayLabel = STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType;
  const dueRow = b.paymentType === "down_payment"
    ? `<p><b>${peso(b.dpAmount)}</b> down payment now &middot; <b>${peso(b.balanceDue)}</b> balance due later</p>`
    : `<p><b>${peso(b.total)}</b> due to complete your reservation</p>`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Booking confirmed — ${b.confirmationNumber} — Evangelina's Staycation`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">Evangelina's Staycation</h2>
        <p>Hi ${b.guestName}, your booking request is in.</p>
        <div style="background:#f7f7f7;border-radius:12px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px;font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.04em">Confirmation number</p>
          <p style="margin:0;font-size:20px;font-weight:bold">${b.confirmationNumber}</p>
        </div>
        <p>${b.unitName} &middot; ${stayLabel} &middot; ${fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
        ${dueRow}
        <p style="color:#767676;font-size:13px">Sign in anytime with your email and this confirmation number to view or manage your booking.</p>
      </div>
    `,
  });
}
