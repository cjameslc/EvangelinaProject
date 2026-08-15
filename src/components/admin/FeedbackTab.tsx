"use client";

import { useMemo, useState } from "react";
import { fmtDate, formatUnitDisplay } from "@/lib/format";
import { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS } from "@/lib/feedbackContent";
import { PLATFORM_LABEL } from "@/lib/constants";
import type { FeedbackAnalytics } from "@/lib/bookingEngine/feedbackService";
import { useToast } from "@/components/ui/Toast";

type FeedbackRow = {
  id: string; overallRating: number; likedTags: string[]; improveComment: string | null; wouldRecommend: string;
  rewardType: string; voucherCode: string; voucherExpiresAt: string; redeemedAt: string | null;
  contactName: string; contactPhone: string; contactEmail: string | null; createdAt: string;
  unit: { id: string; name: string; shortName: string; unitNumber: string };
  booking: { platform: string } | null;
  publicReviewText: string | null; publicDisplayConsent: boolean;
  approved: boolean; featured: boolean; pinnedAt: string | null;
};

const TAG_LABEL = Object.fromEntries(LIKED_TAGS.map((t) => [t.key, t.label]));
const REWARD_META = Object.fromEntries(REWARD_OPTIONS.map((r) => [r.key, r]));
const RECOMMEND_META = Object.fromEntries(RECOMMEND_OPTIONS.map((r) => [r.key, r]));

/** Guest Feedback & Rewards admin view: response list + at-a-glance
 * analytics, plus curation for the public guest-reviews marquee on /book
 * (a review only ever shows there once both the guest consented AND an
 * admin approved it — see GuestReviewsMarquee.tsx / GET /api/reviews).
 * No "edit" action here on purpose — rewriting what reads as a guest's own
 * words defeats the point of a *real* review section; reject/delete are
 * the tools for a review that shouldn't be shown. */
export function FeedbackTab({ feedback: initial, analytics }: { feedback: FeedbackRow[]; analytics: FeedbackAnalytics }) {
  const [feedback, setFeedback] = useState(initial);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pendingReview" | "approved" | "featured">("all");
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

  async function runAction(row: FeedbackRow, action: "approve" | "reject" | "feature" | "unfeature" | "pin" | "unpin") {
    const res = await fetch(`/api/feedback/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) { toast("Couldn't update review.", true); return; }
    const updated = await res.json();
    setFeedback((prev) => prev.map((f) => (f.id === row.id ? { ...f, approved: updated.approved, featured: updated.featured, pinnedAt: updated.pinnedAt } : f)));
  }

  async function deleteReview(row: FeedbackRow) {
    if (!confirm(`Delete ${row.contactName}'s feedback? This can't be undone.`)) return;
    const res = await fetch(`/api/feedback/${row.id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete.", true); return; }
    setFeedback((prev) => prev.filter((f) => f.id !== row.id));
    toast("Deleted.");
  }

  const units = useMemo(() => {
    const seen = new Map<string, FeedbackRow["unit"]>();
    for (const f of initial) seen.set(f.unit.id, f.unit);
    return [...seen.values()];
  }, [initial]);
  const platforms = useMemo(() => [...new Set(initial.map((f) => f.booking?.platform).filter((p): p is string => !!p))], [initial]);

  const filtered = feedback.filter((f) => {
    if (ratingFilter !== "all" && String(f.overallRating) !== ratingFilter) return false;
    if (unitFilter !== "all" && f.unit.id !== unitFilter) return false;
    if (platformFilter !== "all" && f.booking?.platform !== platformFilter) return false;
    if (statusFilter === "pendingReview" && !(f.publicDisplayConsent && !f.approved)) return false;
    if (statusFilter === "approved" && !f.approved) return false;
    if (statusFilter === "featured" && !f.featured) return false;
    return true;
  });

  const pendingRedemption = feedback.filter((f) => f.rewardType !== "discount" && !f.redeemedAt).length;
  const pendingReview = feedback.filter((f) => f.publicDisplayConsent && !f.approved).length;

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Responses" value={String(analytics.count)} />
        <StatCard label="Avg. rating" value={analytics.count === 0 ? "—" : `${analytics.averageRating.toFixed(1)} ★`} />
        <StatCard label="Vouchers to redeem" value={String(pendingRedemption)} />
        <StatCard label="Reviews awaiting approval" value={String(pendingReview)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="field-input w-auto">
          <option value="all">All reviews</option>
          <option value="pendingReview">Awaiting approval</option>
          <option value="approved">Approved (public)</option>
          <option value="featured">Featured</option>
        </select>
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
        </select>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="field-input w-auto">
          <option value="all">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{formatUnitDisplay(u.unitNumber, u.shortName)}</option>)}
        </select>
        {platforms.length > 0 && (
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="field-input w-auto">
            <option value="all">All platforms</option>
            {platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p] ?? p}</option>)}
          </select>
        )}
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

      {filtered.length === 0 ? (
        <p className="card p-4 text-[13px] text-[var(--gray)]">No feedback matches these filters.</p>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {filtered.map((f) => {
            const reward = REWARD_META[f.rewardType];
            const recommend = RECOMMEND_META[f.wouldRecommend];
            const needsManualRedeem = f.rewardType !== "discount";
            return (
              <div key={f.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-extrabold">{"★".repeat(f.overallRating)}{"☆".repeat(5 - f.overallRating)}</span>
                      <span className="text-[12px] text-[var(--gray)]">{formatUnitDisplay(f.unit.unitNumber, f.unit.shortName)}</span>
                      {f.booking?.platform && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">{PLATFORM_LABEL[f.booking.platform] ?? f.booking.platform}</span>}
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

                {f.publicDisplayConsent && (
                  <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">
                        📣 For the public reviews section
                        {f.approved && <span className="rounded-full bg-green/10 px-2 py-0.5 text-[10.5px] text-green">Approved</span>}
                        {f.featured && <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10.5px] text-amber">Featured</span>}
                        {f.pinnedAt && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px]">📌 Pinned</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {f.approved ? (
                          <button onClick={() => runAction(f, "reject")} className="btn-sm btn">Hide</button>
                        ) : (
                          <button onClick={() => runAction(f, "approve")} className="btn-sm btn-primary">Approve</button>
                        )}
                        <button onClick={() => runAction(f, f.featured ? "unfeature" : "feature")} className="btn-sm btn">{f.featured ? "Unfeature" : "Feature"}</button>
                        <button onClick={() => runAction(f, f.pinnedAt ? "unpin" : "pin")} className="btn-sm btn">{f.pinnedAt ? "Unpin" : "Pin"}</button>
                        <button onClick={() => deleteReview(f)} className="btn-sm btn text-rausch">Delete</button>
                      </div>
                    </div>
                    {f.publicReviewText ? (
                      <p className="mt-2 text-[13px] italic">&ldquo;{f.publicReviewText}&rdquo;</p>
                    ) : (
                      <p className="mt-2 text-[12px] text-[var(--gray)]">Consented to public display, no written quote given.</p>
                    )}
                  </div>
                )}

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
