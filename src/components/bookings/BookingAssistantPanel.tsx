"use client";

import { useState } from "react";
import { AvailabilityChat, type AvailabilityResult } from "./AvailabilityChat";
import { TeamCollaborationPanel } from "./TeamCollaborationPanel";
import { CalendarIcon, MessageIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/chat/clientTypes";

type Unit = { id: string; unitNumber: string; shortName: string };
type RecentBooking = { confirmationNumber: string | null; guests: string[]; unit: { unitNumber: string; name: string } };

/**
 * One unified, tabbed workspace for "Check availability" and "Team
 * Collaboration" — replaces the earlier side-by-side two-column layout,
 * which squeezed the full three-pane chat client into half-width and read
 * as two glued-together boxes rather than one tool. A tab switch keeps
 * them genuinely combined (never two separate panels on screen at once)
 * while giving whichever mode is active the panel's full width.
 */
export function BookingAssistantPanel({
  units, onPrefillBooking, onAvailabilityResult,
  currentUserId, isAdmin, initialConversations, recentBookings, lastAvailability,
  onOpenCreateBooking,
}: {
  units: Unit[];
  onPrefillBooking: (v: { unitId: string; date: string; stayType: string }) => void;
  onAvailabilityResult: (data: AvailabilityResult, unitLabel: string) => void;
  currentUserId: string;
  isAdmin: boolean;
  initialConversations: ConversationSummary[];
  recentBookings: RecentBooking[];
  lastAvailability: { data: AvailabilityResult; unitLabel: string } | null;
  onOpenCreateBooking: () => void;
}) {
  const [tab, setTab] = useState<"availability" | "chat">("availability");
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 pb-3 pt-4 text-left">
        <div>
          <div className="text-[15px] font-extrabold">Booking Assistant</div>
          <div className="text-[12px] text-[var(--gray)]">Check availability, then loop in your team — one tool, no tab-hopping.</div>
        </div>
        <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", !open && "-rotate-90")} />
      </button>

      {open && (
        <>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-2.5">
            <div className="flex rounded-full border border-[var(--line)] bg-[var(--bg-2)] p-1">
              <button
                onClick={() => setTab("availability")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition",
                  tab === "availability" ? "bg-[var(--card)] text-rausch shadow-s" : "text-[var(--gray)] hover:text-[var(--ink)]"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Check Availability</span>
                <span className="sm:hidden">Availability</span>
              </button>
              <button
                onClick={() => setTab("chat")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition",
                  tab === "chat" ? "bg-[var(--card)] text-rausch shadow-s" : "text-[var(--gray)] hover:text-[var(--ink)]"
                )}
              >
                <MessageIcon className="h-3.5 w-3.5" />
                Team Chat
              </button>
            </div>
          </div>

          <div className={cn("border-t border-[var(--line)]", tab === "availability" && "p-4")}>
            {tab === "availability" ? (
              <AvailabilityChat units={units} onPrefillBooking={onPrefillBooking} onResult={onAvailabilityResult} />
            ) : (
              <TeamCollaborationPanel
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                initialConversations={initialConversations}
                recentBookings={recentBookings}
                lastAvailability={lastAvailability}
                onOpenCheckAvailability={() => setTab("availability")}
                onOpenCreateBooking={onOpenCreateBooking}
                bare
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
