"use client";

import { useMemo, useState } from "react";
import { ChatAvatar } from "./ChatAvatar";
import { BellIcon, CheckIcon, TrashIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

export type NotificationEntry = {
  id: string;
  conversationId: string;
  conversationName: string;
  senderName: string;
  avatarUrl: string | null;
  avatarColor: string;
  preview: string;
  createdAt: string;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Bell-icon dropdown listing recent message notifications this session has
 * seen — a session-local log (no NotificationLog table exists, and every
 * event here is already fully recoverable from the real conversation list,
 * so this is a convenience view, not a second source of truth). */
export function NotificationCenter({
  open, onToggle, entries, unreadConversationIds, onMarkAllRead, onClear, onJump,
}: {
  open: boolean;
  onToggle: () => void;
  entries: NotificationEntry[];
  unreadConversationIds: Set<string>;
  onMarkAllRead: () => void;
  onClear: () => void;
  onJump: (conversationId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const visible = useMemo(
    () => (filter === "unread" ? entries.filter((e) => unreadConversationIds.has(e.conversationId)) : entries),
    [entries, filter, unreadConversationIds]
  );

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        title="Notifications"
        className={cn("relative grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]", open && "bg-[var(--bg-2)] text-[var(--ink)]")}
      >
        <BellIcon className="h-4 w-4" />
        {unreadConversationIds.size > 0 && <span className="absolute right-1 top-1 h-2 w-2 animate-pop-in rounded-full bg-rausch ring-2 ring-[var(--card)]" />}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-20 w-[320px] animate-fade-up rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2.5">
            <span className="text-[13px] font-extrabold">Notifications</span>
            <div className="flex items-center gap-1">
              <button onClick={onMarkAllRead} title="Mark all read" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-teal">
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
              <button onClick={onClear} title="Clear" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-rausch">
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex gap-1 border-b border-[var(--line)] p-1.5">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn("flex-1 rounded-lg px-2 py-1 text-[11px] font-bold capitalize transition", filter === f ? "bg-rausch/10 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-[var(--gray)]">Nothing here.</p>
            ) : (
              visible.map((e) => (
                <button key={e.id} onClick={() => onJump(e.conversationId)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-[var(--bg-2)]">
                  <ChatAvatar name={e.senderName} avatarUrl={e.avatarUrl} avatarColor={e.avatarColor} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-extrabold">{e.senderName}</span>
                      <span className="flex-none text-[10px] text-[var(--gray)]">{relativeTime(e.createdAt)}</span>
                    </div>
                    <p className="truncate text-[11.5px] text-[var(--gray)]">{e.preview}</p>
                    <p className="truncate text-[10px] font-semibold text-[var(--gray)]">in {e.conversationName}</p>
                  </div>
                  {unreadConversationIds.has(e.conversationId) && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-rausch" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
