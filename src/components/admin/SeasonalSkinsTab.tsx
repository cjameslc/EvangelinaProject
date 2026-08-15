"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { SKIN_LIST, getSkin } from "@/lib/skins/config";
import { resolveActiveSkinId, isWithinSchedule } from "@/lib/skins/resolveActiveSkinId";
import { SeasonalChallengeCard } from "@/components/skins/SeasonalChallengeCard";
import { SeasonalSkinProvider } from "@/components/skins/SeasonalSkinProvider";
import type { SkinId } from "@/lib/skins/types";

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatSchedule(schedule: { startMonth: number; startDay: number; endMonth: number; endDay: number } | null): string {
  if (!schedule) return "Manual only";
  return `${MONTH_NAMES[schedule.startMonth]} ${schedule.startDay} – ${MONTH_NAMES[schedule.endMonth]} ${schedule.endDay}`;
}

/**
 * Admin's Seasonal Skins panel (brief section 29/30) — Manual > Scheduled >
 * Default priority (resolveActiveSkinId) is computed the exact same way
 * here as it is server-side for every real page, so what an admin sees in
 * "what would be active automatically" always matches reality. Preview
 * renders real shared skin components (SeasonalChallengeCard) with real
 * sample numbers rather than a screenshot/mockup, so it can never drift
 * out of sync with what guests/staff actually see.
 */
export function SeasonalSkinsTab({
  activeSeasonalSkinId,
  onSaved,
}: {
  activeSeasonalSkinId: string | null;
  onSaved?: (patch: { activeSeasonalSkinId: string | null }) => void;
}) {
  const toast = useToast();
  const [manualOverride, setManualOverride] = useState<string | null>(activeSeasonalSkinId);
  const [previewId, setPreviewId] = useState<SkinId>((activeSeasonalSkinId as SkinId) ?? "evangelina");
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }, []);
  const automaticSkinId = useMemo(() => resolveActiveSkinId(null, today), [today]);
  const liveActiveSkinId = useMemo(() => resolveActiveSkinId(manualOverride, today), [manualOverride, today]);
  const previewSkin = getSkin(previewId);

  async function activate(id: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSeasonalSkinId: id }),
      });
      if (!res.ok) { toast("Couldn't update the active skin.", true); return; }
      setManualOverride(id);
      onSaved?.({ activeSeasonalSkinId: id });
      toast(id ? `${getSkin(id).name} activated app-wide ✓` : "Returned to automatic scheduling ✓");
    } catch {
      toast("Couldn't reach the server — check your connection.", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Currently live, app-wide</div>
        <div className="mt-1 flex items-center gap-2 text-[18px] font-extrabold">
          <span aria-hidden="true">{getSkin(liveActiveSkinId).emoji}</span> {getSkin(liveActiveSkinId).fullName}
        </div>
        <p className="mt-1 text-[12.5px] text-[var(--gray)]">
          {manualOverride
            ? "Manual override is active — it wins over any scheduled event until cleared below."
            : `Automatic — today matches ${automaticSkinId === "evangelina" ? "no scheduled event, so the default applies" : getSkin(automaticSkinId).name}.`}
        </p>
        {manualOverride && (
          <button onClick={() => activate(null)} disabled={saving} className="btn btn-sm mt-3 disabled:opacity-50">
            Clear override — return to automatic
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SKIN_LIST.map((s) => {
          const isLive = liveActiveSkinId === s.id;
          const isManuallyOverridden = manualOverride === s.id;
          const isScheduledToday = isWithinSchedule(s.schedule, today.month, today.day);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setPreviewId(s.id)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 text-left transition",
                previewId === s.id ? "border-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--bg-2)]"
              )}
            >
              <span
                className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full text-[16px]"
                style={{ background: `${s.colors.primary}1A` }}
              >
                {s.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-extrabold">{s.name}</span>
                  {isLive && <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-teal">Active</span>}
                  {isScheduledToday && !isLive && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber">Scheduled today</span>}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[var(--gray)]">{formatSchedule(s.schedule)}</div>
              </div>
              {isManuallyOverridden && <span className="mt-1 flex-none text-[11px] font-bold text-[var(--ink)]">●</span>}
            </button>
          );
        })}
      </div>

      {/* Preview — real shared skin components, real sample data, so this
          can never show something the live pages wouldn't actually
          render. */}
      <SeasonalSkinProvider skinId={previewId}>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <div className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Preview — {previewSkin.name}</div>

          <div className="mb-3 rounded-2xl p-5 text-center" style={{ background: `linear-gradient(135deg, ${previewSkin.colors.surfaceFrom}, ${previewSkin.colors.surfaceTo})` }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: previewSkin.colors.primary }}>{previewSkin.messaging.marketingEyebrow}</div>
            <div className="mt-1.5 text-[19px] font-extrabold tracking-tight">{previewSkin.messaging.marketingHeadline}</div>
            <p className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] text-[var(--gray)]">{previewSkin.messaging.marketingSubtext}</p>
            {/* Same gradient formula (secondary→accent) and dark text as the
                real hero CTA in ListingsGrid — this preview must mirror
                what the live page actually renders, not a lookalike. A
                fixed white-text/primary→secondary version broke for the
                Airbnb skin, whose secondary is white by design. */}
            <span
              className="mt-3 inline-block rounded-xl px-4 py-2 text-[12.5px] font-bold text-[#15120E]"
              style={{ background: `linear-gradient(to right, ${previewSkin.colors.secondary}, ${previewSkin.colors.accent})` }}
            >
              {previewSkin.messaging.marketingCta}
            </span>
          </div>

          {previewSkin.spotlight && (
            <div className="relative mb-3 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSkin.spotlight.imageUrl} alt={previewSkin.spotlight.imageAlt} className="h-32 w-full object-cover" />
              <div
                className="absolute inset-0 flex items-end p-3"
                style={{ background: `linear-gradient(100deg, ${previewSkin.colors.primary}CC 0%, transparent 70%)` }}
              >
                <p className="max-w-[75%] text-[12px] font-medium italic text-white">{previewSkin.spotlight.message}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SeasonalChallengeCard current={32} target={40} title={previewSkin.messaging.bookerChallengeTitle} subtitle={previewSkin.messaging.bookerChallengeSub} />
            <SeasonalChallengeCard current={6} target={8} title={previewSkin.messaging.housekeepingTitle} subtitle="Today's room turnover" />
          </div>

          <p className="mt-3 text-[12px] text-[var(--gray)]">
            Booking success message: <span className="font-semibold text-[var(--ink)]">&ldquo;{previewSkin.messaging.bookingSuccessMessage}&rdquo;</span>
          </p>
        </div>
      </SeasonalSkinProvider>

      <button
        onClick={() => activate(previewId)}
        disabled={saving || liveActiveSkinId === previewId && manualOverride === previewId}
        className="btn-primary w-full justify-center disabled:opacity-50"
      >
        {saving ? "Activating…" : `Activate ${previewSkin.name} app-wide`}
      </button>
    </div>
  );
}
