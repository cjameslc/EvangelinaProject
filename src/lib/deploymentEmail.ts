import { Resend } from "resend";
import { fmtDate, fmtTime } from "@/lib/format";

// Same reasoning as src/lib/email.ts's own escapeHtml — event.title/
// description/releaseNotes are admin-entered free text interpolated
// straight into a hand-built HTML email, with no React auto-escaping to
// fall back on.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// src/lib/email.ts is explicitly guest-facing only ("staff auth never sends
// email — this file has no bearing on staff login") — this is the one
// staff-facing sender in the app, kept in its own file rather than
// stretching that documented boundary. Same Resend setup/FROM convention.
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "Evangelina's Staycation <onboarding@resend.dev>";

export async function sendDeploymentNotice(
  to: string[],
  event: { title: string; description: string; status: string; startsAt: string; endsAt: string | null; releaseNotes: string | null }
) {
  if (to.length === 0) return;
  const scheduleLine = `${fmtDate(event.startsAt)}, ${fmtTime(event.startsAt)}${event.endsAt ? ` – ${fmtTime(event.endsAt)}` : ""} (PHT)`;
  return resend.emails.send({
    from: FROM,
    to,
    subject: `${event.title} — Evangelina's Staycation`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#FF385C">Evangelina's Staycation</h2>
        <p style="margin:0 0 8px;font-size:12px;color:#767676;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(event.status.replace("_", " "))}</p>
        <h3 style="margin:0 0 12px">${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.description)}</p>
        <p style="color:#767676;font-size:13px">${scheduleLine}</p>
        ${event.releaseNotes ? `<p style="margin-top:16px">${escapeHtml(event.releaseNotes)}</p>` : ""}
      </div>
    `,
  });
}
