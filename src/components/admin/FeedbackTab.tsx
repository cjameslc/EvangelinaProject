"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS } from "@/lib/feedbackContent";
import type { FeedbackAnalytics } from "@/lib/bookingEngine/feedbackService";
import { useToast } from "@/components/ui/Toast";

type FeedbackRow = {
  id: string; overallRating: number; likedTags: string[]; improveComment: string | null; wouldRecommend: string;
  rewardType: string; voucherCode: string; voucherExpiresAt: string; redeemedAt: string | null;
  contactName: string; contactPhone: string; contactEmail: string | null; createdAt: string;
  unit: { id: string; name: string; shortName: string; unitNumber: string };
};

const TAG_LABEL = Object.fromEntries(LIKED_TAGS.map((t) => [t.key, t.label]));
const REWARD_META = Object.fromEntries(REWARD_OPTIONS.map((r) => [r.key, r]));
const RECOMMEND_META = Object.fromEntries(RECOMMEND_OPTIONS.map((r) => [r.key, r]));

/** Guest Feedback & Rewards — read-mostly admin view: response list +
 * at-a-glance analytics. The only write action here is marking a
 * staff-redeemed reward (late checkout / coffee) as used; the discount
 * reward tracks itself automatically via the real Coupon it created. */
export function FeedbackTab({ feedback: initial, analytics }: { feedback: FeedbackRow[]; analytics: FeedbackAnalytics }) {
  const [feedback, setFeedback] = useState(initial);
  const toast = useToast();

  async function toggleRedeemed(row: FeedbackRow) {
    const nextRedeemed = !row.redeemedAt;
    const res = await fetch(`/api/feedback/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redeemed: nextRedeemed }),
    });
    if (!res.ok) { toast("Couldn't update voucher status", true); return; }
    const updated = await res.json();
    setFeedback((prev) => prev.map((f) => (f.id === row.id ? { ...f, redeemedAt: updated.redeemedAt } : f)));
    toast(nextRedeemed ? "Marked redeemed ✓" : "Marked unredeemed");
  }

  const pendingRedemption = feedback.filter((f) => f.rewardType !== "discount" && !f.redeemedAt).length;

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Responses" value={String(analytics.count)} />
        <StatCard label="Avg. rating" value={analytics.count === 0 ? "—" : `${analytics.averageRating.toFixed(1)} ★`} />
        <StatCard label="Would recommend" value={analytics.count === 0 ? "—" : `${Math.round(((analytics.recommendBreakdown.definitely + analytics.recommendBreakdown.probably) / analytics.count) * 100)}%`} />
        <StatCard label="Vouchers to redeem" value={String(pendingRedemption)} />
      </div>

      {analytics.count > 0 && (
        <div className="card mb-5 p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Most liked</div>
          <div className="flex flex-wrap gap-1.5">
            {analytics.tagCounts.filter((t) => t.count > 0).map((t) => (
              <span key={t.key} className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11.5px] font-bold">{t.label} · {t.count}</span>
            ))}
          </div>
        </div>
      )}

      {feedback.length === 0 ? (
        <p className="card p-4 text-[13px] text-[var(--gray)]">No feedback submitted yet.</p>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {feedback.map((f) => {
            const reward = REWARD_META[f.rewardType];
            const recommend = RECOMMEND_META[f.wouldRecommend];
            const needsManualRedeem = f.rewardType !== "discount";
            return (
              <div key={f.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-extrabold">{"★".repeat(f.overallRating)}{"☆".repeat(5 - f.overallRating)}</span>
                      <span className="text-[12px] text-[var(--gray)]">{f.unit.shortName} · Unit {f.unit.unitNumber}</span>
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--gray)]">{fmtDate(f.createdAt, { month: "short", day: "numeric", year: "numeric" })} · {f.contactName} · {f.contactPhone}</div>
                  </div>
                  {recommend && <span className="flex-none rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-bold">{recommend.icon} {recommend.label}</span>}
                </div>

                {f.likedTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {f.likedTags.map((t) => <span key={t} className="rounded-full bg-rausch/10 px-2 py-0.5 text-[11px] font-bold text-rausch">{TAG_LABEL[t] ?? t}</span>)}
                  </div>
                )}

                {f.improveComment && <p className="mt-2 text-[13px] italic text-[var(--gray)]">&ldquo;{f.improveComment}&rdquo;</p>}

                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bg-2)] px-3 py-2">
                  <span className="text-[15px]">{reward?.icon}</span>
                  <span className="flex-1 text-[12.5px] font-bold">{reward?.label}</span>
                  <span className="font-mono text-[12px] font-extrabold tracking-wide">{f.voucherCode}</span>
                  <span className="text-[11px] text-[var(--gray)]">exp {fmtDate(f.voucherExpiresAt, { month: "short", day: "numeric", year: "numeric" })}</span>
                  {needsManualRedeem && (
                    <button onClick={() => toggleRedeemed(f)} className={`btn-sm ${f.redeemedAt ? "btn" : "btn-primary"}`}>
                      {f.redeemedAt ? "Redeemed ✓" : "Mark redeemed"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">{label}</div>
      <div className="mt-0.5 text-[19px] font-extrabold">{value}</div>
    </div>
  );
}
