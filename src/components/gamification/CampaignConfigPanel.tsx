"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { CampaignDashboardData } from "@/lib/campaignEngine/types";

type EmployeeOption = { id: string; name: string; role: string; active: boolean; user?: { avatarUrl: string | null; avatarColor: string | null } | null };

function Avatar({ name, url, color, size = 22 }: { name: string; url?: string | null; color?: string | null; size?: number }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatarUrl is a stored data-URL, same pattern as every other avatar in this app
    <img src={url} alt="" width={size} height={size} className="flex-none rounded-full object-cover" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span
      className="grid flex-none place-items-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, background: color || "#6C5CE7", fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}

/**
 * Admin-only campaign setup: target/rewards/hero image + roster with a
 * per-campaign "side" (A/B) — deliberately independent of Employee.teamKey
 * (payroll's own A/B/C grouping), see CampaignParticipant's schema comment.
 */
export function CampaignConfigPanel({
  open, onClose, campaign, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  campaign: CampaignDashboardData;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [target, setTarget] = useState(String(campaign.targetPesos));
  const [winnerReward, setWinnerReward] = useState(String(campaign.winnerRewardPesos));
  const [participantReward, setParticipantReward] = useState(String(campaign.participantRewardPesos));
  const [heroImageUrl, setHeroImageUrl] = useState(campaign.heroImageUrl ?? "");
  const [sides, setSides] = useState<Record<string, "A" | "B" | null>>(() =>
    Object.fromEntries(campaign.ranked.map((r) => [r.employeeId, r.side as "A" | "B"]))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(String(campaign.targetPesos));
    setWinnerReward(String(campaign.winnerRewardPesos));
    setParticipantReward(String(campaign.participantRewardPesos));
    setHeroImageUrl(campaign.heroImageUrl ?? "");
    setSides(Object.fromEntries(campaign.ranked.map((r) => [r.employeeId, r.side as "A" | "B"])));
    fetch("/api/employees").then((r) => r.json()).then((list: EmployeeOption[]) => setEmployees(list.filter((e) => e.active)));
  }, [open, campaign]);

  function cycleSide(id: string) {
    setSides((s) => ({ ...s, [id]: s[id] === "A" ? "B" : s[id] === "B" ? null : "A" }));
  }

  async function save() {
    setSaving(true);
    const participants = Object.entries(sides).filter(([, side]) => side).map(([employeeId, side]) => ({ employeeId, side }));
    const res = await fetch("/api/gamification/campaign/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: campaign.campaignId,
        targetPesos: Number(target),
        winnerRewardPesos: Number(winnerReward),
        participantRewardPesos: Number(participantReward),
        heroImageUrl: heroImageUrl.trim() || null,
        participants,
      }),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't save campaign settings", true); return; }
    toast("Campaign updated ✓");
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Configure Campaign" sub={campaign.name} maxWidth={620} footer={
      <>
        <button onClick={onClose} className="btn">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
      </>
    }>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="field-label">Target (₱)</label>
          <input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} className="field-input mt-1" />
        </div>
        <div>
          <label className="field-label">Winner reward (₱)</label>
          <input type="number" min={0} value={winnerReward} onChange={(e) => setWinnerReward(e.target.value)} className="field-input mt-1" />
        </div>
        <div>
          <label className="field-label">Participant reward (₱)</label>
          <input type="number" min={0} value={participantReward} onChange={(e) => setParticipantReward(e.target.value)} className="field-input mt-1" />
        </div>
      </div>
      <div className="mt-3">
        <label className="field-label">Hero image URL (optional)</label>
        <input
          type="url" placeholder="https://images.unsplash.com/..." value={heroImageUrl}
          onChange={(e) => setHeroImageUrl(e.target.value)} className="field-input mt-1"
        />
        <p className="mt-1 text-[11.5px] text-[var(--gray)]">Paste any image URL (an Unsplash photo works well). Leave blank to use the built-in gradient artwork.</p>
      </div>
      <div className="mt-4">
        <label className="field-label">Participants &amp; sides</label>
        <p className="mt-1 text-[11.5px] text-[var(--gray)]">Tap a name to cycle Unassigned → Group A → Group B.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {employees.map((e) => {
            const side = sides[e.id] ?? null;
            return (
              <button
                key={e.id}
                onClick={() => cycleSide(e.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-bold transition duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.96]",
                  side === "A" && "border-violet bg-violet/10 text-violet",
                  side === "B" && "border-blue bg-blue/10 text-blue",
                  !side && "border-[var(--line-2)] text-[var(--gray)]"
                )}
              >
                <Avatar name={e.name} url={e.user?.avatarUrl} color={e.user?.avatarColor} />
                {e.name} {side ? `· Group ${side}` : ""}
              </button>
            );
          })}
          {employees.length === 0 && <span className="text-[12.5px] text-[var(--gray)]">No active employees found.</span>}
        </div>
      </div>
    </Modal>
  );
}
