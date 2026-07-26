"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChatView, type ChatViewHandle } from "@/components/chat/ChatView";
import { STAY_TYPES } from "@/lib/constants";
import { fmtDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { ShareIcon, CopyIcon, PinIcon } from "@/components/ui/Icons";
import type { ConversationSummary, PresenceUser } from "@/lib/chat/clientTypes";
import type { AvailabilityResult } from "./AvailabilityChat";

type RecentBooking = { confirmationNumber: string | null; guests: string[]; unit: { unitNumber: string; name: string } };

const STATUS_RANK: Record<PresenceUser["status"], number> = { ONLINE: 0, BUSY: 1, MEETING: 1, AWAY: 2, DND: 2, OFFLINE: 3 };
const STATUS_DOT: Record<PresenceUser["status"], string> = {
  ONLINE: "bg-green", BUSY: "bg-rausch", MEETING: "bg-rausch", AWAY: "bg-amber", DND: "bg-amber", OFFLINE: "bg-[var(--line-2)]",
};
const STATUS_LABEL: Record<PresenceUser["status"], string> = {
  ONLINE: "Online", BUSY: "Busy", MEETING: "In a meeting", AWAY: "Away", DND: "Do not disturb", OFFLINE: "Offline",
};

function formatAvailabilityCard(data: AvailabilityResult, unitLabel: string): string {
  const lines = [`🏡 Availability`, fmtDate(data.date, { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }), unitLabel];
  const seen = new Set<string>();
  for (const opt of [...data.requested, ...data.alternatives.sameDayOtherOptions]) {
    const label = STAY_TYPES[opt.stayType as keyof typeof STAY_TYPES]?.label ?? opt.stayType;
    const key = `${opt.unit}-${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${opt.available ? "✅" : "❌"} ${label} ${opt.available ? "Available" : "Unavailable"}${data.requested.length > 1 || data.alternatives.sameDayOtherOptions.length > 0 ? ` — ${opt.unit}` : ""}`);
  }
  return lines.join("\n");
}

/**
 * The team-collaboration side of the Bookings workspace — sits beside
 * "Check availability" (see BookingsView) so bookers never leave the page
 * to coordinate with teammates. Reuses the exact same ChatView the
 * standalone /chat page used to render (embedded mode only changes its
 * outer height, per the consolidation spec's "don't change size" rule);
 * everything here that isn't the roster header or quick-actions row is
 * literally the same component, same APIs, same polling.
 */
export function TeamCollaborationPanel({
  currentUserId, isAdmin, initialConversations, recentBookings, lastAvailability,
  onOpenCheckAvailability, onOpenCreateBooking, bare = false,
}: {
  currentUserId: string;
  isAdmin: boolean;
  initialConversations: ConversationSummary[];
  recentBookings: RecentBooking[];
  lastAvailability: { data: AvailabilityResult; unitLabel: string } | null;
  onOpenCheckAvailability: () => void;
  onOpenCreateBooking: () => void;
  /** Drops the outer card border/corners — used when a parent (Booking
   * Assistant's tabbed panel) already supplies that chrome, so the two
   * don't nest into a visible "card inside a card." */
  bare?: boolean;
}) {
  const toast = useToast();
  const chatRef = useRef<ChatViewHandle>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [shareBookingOpen, setShareBookingOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(true);

  const sortedRoster = useMemo(
    () => [...presence].filter((p) => p.id !== currentUserId).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name)),
    [presence, currentUserId]
  );
  const onlineCount = sortedRoster.filter((p) => p.status === "ONLINE").length;

  async function requireActiveConversation(): Promise<boolean> {
    if (chatRef.current?.activeConversationId()) return true;
    toast("Pick a conversation on the right first");
    return false;
  }

  async function shareAvailability() {
    if (!lastAvailability) { toast("Check an availability slot first"); return; }
    if (!(await requireActiveConversation())) return;
    const ok = await chatRef.current?.sendQuickMessage(formatAvailabilityCard(lastAvailability.data, lastAvailability.unitLabel));
    if (ok) toast("Availability shared");
  }

  async function copyAvailability() {
    if (!lastAvailability) { toast("Check an availability slot first"); return; }
    await navigator.clipboard.writeText(formatAvailabilityCard(lastAvailability.data, lastAvailability.unitLabel));
    toast("Availability copied");
  }

  async function shareBooking(ref: string) {
    setShareBookingOpen(false);
    if (!(await requireActiveConversation())) return;
    const ok = await chatRef.current?.sendQuickMessage(`Sharing a booking: #${ref}`);
    if (ok) toast("Booking shared");
  }

  async function pinConversation() {
    if (!(await requireActiveConversation())) return;
    const ok = await chatRef.current?.pinActiveConversation();
    if (ok) toast("Conversation pinned");
  }

  return (
    <div className={cn("flex h-[640px] min-w-0 flex-col overflow-hidden", !bare && "rounded-2xl border border-[var(--line)]")}>
      <div className={cn("flex-none border-b border-[var(--line)] bg-[var(--card)] px-4", bare ? "py-3" : "py-3")}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setRosterOpen((v) => !v)} className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--ink)] hover:text-rausch">
            <span className={cn("h-2 w-2 rounded-full", onlineCount > 0 ? "bg-green" : "bg-[var(--line-2)]")} />
            {onlineCount} team member{onlineCount !== 1 ? "s" : ""} online
          </button>
          {isAdmin && (
            <a href="/chat/audit" title="Admin audit log" className="text-[11px] font-bold text-rausch hover:underline">Audit log</a>
          )}
        </div>

        {rosterOpen && sortedRoster.length > 0 && (
          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
            {sortedRoster.map((p) => (
              <div key={p.id} title={`${p.name} · ${STATUS_LABEL[p.status]}${p.status === "OFFLINE" ? ` · last active ${fmtDate(p.lastActiveAt, { month: "short", day: "numeric" })}` : ""}`} className="flex flex-none flex-col items-center gap-1">
                <div className="relative">
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt={p.name} className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: p.avatarColor }}>
                      {initials(p.name)}
                    </span>
                  )}
                  <span className={cn("absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-[var(--card)]", STATUS_DOT[p.status])} />
                </div>
                <span className="max-w-[56px] truncate text-[10px] font-semibold text-[var(--gray)]">{p.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!bare && <button onClick={onOpenCheckAvailability} className="pill">🏡 Check Availability</button>}
          <button onClick={onOpenCreateBooking} className="pill">➕ Create Booking</button>
          <Link href="/calendar" className="pill">📅 Open Calendar</Link>
          <span className="mx-0.5 h-4 w-px flex-none bg-[var(--line)]" />
          <div className="relative">
            <button onClick={() => setShareBookingOpen((v) => !v)} className="pill"><ShareIcon className="mr-1 inline h-3 w-3" />Share Booking</button>
            {shareBookingOpen && (
              <div className="absolute left-0 top-[34px] z-10 w-64 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card">
                {recentBookings.filter((b) => b.confirmationNumber).length === 0 ? (
                  <div className="px-2.5 py-2 text-[12px] text-[var(--gray)]">No recent bookings yet.</div>
                ) : (
                  recentBookings.filter((b) => b.confirmationNumber).slice(0, 6).map((b) => (
                    <button
                      key={b.confirmationNumber}
                      onClick={() => shareBooking(b.confirmationNumber!)}
                      className="flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-[var(--bg-2)]"
                    >
                      <span className="text-[12.5px] font-bold text-rausch">{b.confirmationNumber}</span>
                      <span className="truncate text-[11.5px] text-[var(--gray)]">{b.guests[0] ?? "Guest"} · {b.unit.unitNumber}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={shareAvailability} className="pill" title="Send your last availability check into this conversation"><ShareIcon className="mr-1 inline h-3 w-3" />Share Availability</button>
          <button onClick={copyAvailability} className="pill" title="Copy your last availability check to clipboard"><CopyIcon className="mr-1 inline h-3 w-3" />Copy Availability</button>
          <button onClick={pinConversation} className="pill" title="Pin this conversation"><PinIcon className="mr-1 inline h-3 w-3" />Pin</button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChatView ref={chatRef} currentUserId={currentUserId} isAdmin={isAdmin} initialConversations={initialConversations} embedded onPresenceUpdate={setPresence} />
      </div>
    </div>
  );
}
