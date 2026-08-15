import { Resend } from "resend";
import { peso, fmtDate } from "@/lib/format";
import { STAY_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getDefaultOwnerId } from "@/lib/ownerScope";

// guestName below is raw, publicly-submitted booking-form input — any
// anonymous guest can set it to arbitrary HTML/script. This app's own React
// frontend auto-escapes everywhere else, but a hand-built HTML email string
// has no such protection, so it needs its own escape before interpolation
// (confirmed live: an unescaped guest name could inject markup into the
// booking-confirmation email an actual guest receives).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Guest-facing email only (magic-link login now; booking-confirmation/
// reminder emails plug into this same sender later via notificationService).
// Staff auth never sends email — this file has no bearing on staff login.
const resend = new Resend(process.env.RESEND_API_KEY);

// Resend's free tier only delivers from a verified domain OR from
// onboarding@resend.dev to the Resend account's own email until a real
// sending domain is verified — expected during development, documented here
// so a "why didn't the guest get the email" report isn't a mystery later.
const FROM = process.env.RESEND_FROM_EMAIL || "Evangelina's Staycation <onboarding@resend.dev>";

// No booking/unit context exists yet at login time — resolves the default
// owner's business name the same way every other session-less guest path
// does (see getDefaultOwnerId's doc comment in src/lib/ownerScope.ts).
async function defaultBusinessName(): Promise<string> {
  const ownerId = await getDefaultOwnerId();
  const owner = ownerId ? await prisma.owner.findUnique({ where: { id: ownerId }, select: { businessName: true } }) : null;
  return owner?.businessName ?? "Evangelina's Staycation";
}

export async function sendGuestLoginEmail(to: string, link: string) {
  const businessName = await defaultBusinessName();
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Your sign-in link — ${businessName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">${escapeHtml(businessName)}</h2>
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
  /** The booked unit's real owner — falls back to the default owner's name
   * only if the caller genuinely couldn't resolve one (should never happen
   * in practice, every booking has a real unit). */
  businessName?: string;
};

export async function sendBookingConfirmationEmail(to: string, b: BookingConfirmationDetails) {
  const businessName = b.businessName ?? (await defaultBusinessName());
  const stayLabel = STAY_TYPES[b.stayType as keyof typeof STAY_TYPES]?.label ?? b.stayType;
  const dueRow = b.paymentType === "down_payment"
    ? `<p><b>${peso(b.dpAmount)}</b> down payment now &middot; <b>${peso(b.balanceDue)}</b> balance due later</p>`
    : `<p><b>${peso(b.total)}</b> due to complete your reservation</p>`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: `Booking confirmed — ${b.confirmationNumber} — ${businessName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">${escapeHtml(businessName)}</h2>
        <p>Hi ${escapeHtml(b.guestName)}, your booking request is in.</p>
        <div style="background:#f7f7f7;border-radius:12px;padding:16px;margin:16px 0">
          <p style="margin:0 0 8px;font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.04em">Confirmation number</p>
          <p style="margin:0;font-size:20px;font-weight:bold">${escapeHtml(b.confirmationNumber)}</p>
        </div>
        <p>${escapeHtml(b.unitName)} &middot; ${escapeHtml(stayLabel)} &middot; ${fmtDate(b.date, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
        ${dueRow}
        <p style="color:#767676;font-size:13px">Sign in anytime with your email and this confirmation number to view or manage your booking.</p>
      </div>
    `,
  });
}
