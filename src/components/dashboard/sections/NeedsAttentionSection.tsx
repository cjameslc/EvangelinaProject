"use client";

import { useState } from "react";
import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { cn } from "@/lib/utils";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/Icons";
import { useAttentionItems } from "../hooks/useAttentionItems";
import type { Unit, Booking, HkState, AttentionFinding, Stock, Bill } from "../types";

export function NeedsAttentionSection({
  attentionFindings,
  units,
  bookingsWeek,
  bookingsMonth,
  hkStates,
  cleaningLogsRecent,
  stocks,
  expenseRequestsMonth,
  pendingGuestRequests,
  dueBills,
  dueDateFor,
  billMeta,
  batteryStats,
  lockedUnits,
  batteryTier,
  upcomingCheckinRiskUnits,
  reserveCodeStats,
  dismissedAttentionKeys,
  todayIso,
}: {
  attentionFindings: AttentionFinding[];
  units: Unit[];
  bookingsWeek: Booking[];
  bookingsMonth: Booking[];
  hkStates: HkState[];
  cleaningLogsRecent: { id: string; unitId: string; startedAt: string; endedAt: string | null; employee: { name: string } | null }[];
  stocks: Stock[];
  expenseRequestsMonth: { id: string; category: string; amount: number; status: string; date: string; employee: { name: string } | null }[];
  pendingGuestRequests: { id: string; type: string; message: string | null; priority: string; photoUrl: string | null; createdAt: string; unit: { shortName: string } | null; guest: { name: string | null; email: string } | null }[];
  dueBills: Bill[];
  dueDateFor: (b: Bill) => Date | null;
  billMeta: (b: Bill) => { icon: string; label: string; sub: string };
  batteryStats: { healthy: number; low: number; critical: number; offline: number; average: number | null; lastUpdated: string | null };
  lockedUnits: Unit[];
  batteryTier: (pct: number | null | undefined) => "critical" | "low" | "healthy" | null;
  upcomingCheckinRiskUnits: { unit: Unit; nextCheckInAt: Date; tier: "critical" | "low" | "offline" }[];
  reserveCodeStats: { byUnit: Map<string, { total: number; available: number }>; total: number; available: number; inUse: number; exhaustedUnits: Unit[] };
  dismissedAttentionKeys: string[];
  todayIso: string;
}) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set(dismissedAttentionKeys));

  async function dismissItem(key: string) {
    setDismissedKeys((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/attention/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    } catch {
      // Best-effort — it'll just reappear on next load if this failed, not worth surfacing an error for.
    }
  }

  const attentionItems = useAttentionItems({
    attentionFindings,
    units,
    bookingsWeek,
    bookingsMonth,
    hkStates,
    cleaningLogsRecent,
    stocks,
    expenseRequestsMonth,
    pendingGuestRequests,
    dueBills,
    dueDateFor,
    billMeta,
    batteryStats,
    lockedUnits,
    batteryTier,
    upcomingCheckinRiskUnits,
    reserveCodeStats,
    dismissedKeys,
    todayIso,
  });

  return (
    <Accordion title="Needs your attention" sub={`${attentionItems.length} to discuss`}>
      {attentionItems.length === 0 ? (
        <p className="text-sm text-[var(--gray)]">Nothing needs your attention right now. 🎉</p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {attentionItems.map((item) => {
            const content = (
              <>
                <span className={cn("mt-1.5 h-2.5 w-2.5 flex-none rounded-full", item.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{item.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--gray)]">{item.desc}</div>
                </div>
                <span className="flex-none rounded-full border border-[var(--line)] px-3 py-1 text-[12px] font-bold text-[var(--gray)]">{item.tag}</span>
                {item.href && <ArrowRightIcon className="h-3.5 w-3.5 flex-none text-[var(--gray)]" />}
              </>
            );
            return (
              <div key={item.id} className="flex items-start gap-2 py-3 first:pt-3 last:pb-3">
                {item.href ? (
                  <Link href={item.href} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg -mx-2 px-2 py-1 transition hover:bg-[var(--bg-2)]">
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
                )}
                <button
                  onClick={() => dismissItem(item.key)}
                  aria-label="Mark as addressed"
                  title="Mark as addressed"
                  className="btn-icon !h-7 !w-7 flex-none"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Accordion>
  );
}
