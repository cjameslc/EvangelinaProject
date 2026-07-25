"use client";

import { useMemo, useState } from "react";
import { ChatAvatar } from "./ChatAvatar";
import { PresenceDot } from "./PresenceDot";
import { SearchIcon, PlusIcon, ShieldIcon, PinIcon } from "@/components/ui/Icons";
import { STATUS_LABEL } from "@/lib/chat/constants";
import { cn } from "@/lib/utils";
import type { ConversationSummary, PresenceUser } from "@/lib/chat/clientTypes";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function Sidebar({
  conversations, presence, activeId, onSelect, onStartDm, onToggleFavorite, isAdmin, currentUserId,
}: {
  conversations: ConversationSummary[];
  presence: PresenceUser[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onStartDm: (userId: string) => void;
  onToggleFavorite: (id: string) => void;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const [tab, setTab] = useState<"chats" | "people">("chats");
  const [query, setQuery] = useState("");

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? conversations.filter((c) => (c.name ?? "").toLowerCase().includes(q)) : conversations;
    // Favorited first, then whatever order the API already gave us
    // (TEAM/GROUP/DM buckets, most-recent-activity within each).
    return [...list].sort((a, b) => Number(b.favorited) - Number(a.favorited));
  }, [conversations, query]);

  const otherPresence = presence.filter((p) => p.id !== currentUserId);
  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? otherPresence.filter((p) => p.name.toLowerCase().includes(q)) : otherPresence;
  }, [otherPresence, query]);

  const onlineCount = otherPresence.filter((p) => p.status !== "OFFLINE").length;

  return (
    <div className="flex h-full w-full flex-col border-r border-[var(--line)] bg-[var(--card)] sm:w-[280px]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] p-3">
        <h2 className="text-[15px] font-extrabold tracking-tight">Team Chat</h2>
        {isAdmin && (
          <a href="/chat/audit" title="Admin audit" className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
            <ShieldIcon className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="flex gap-1 border-b border-[var(--line)] p-2">
        <button onClick={() => setTab("chats")} className={cn("flex-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition", tab === "chats" ? "bg-rausch/10 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}>
          Conversations
        </button>
        <button onClick={() => setTab("people")} className={cn("flex-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition", tab === "people" ? "bg-rausch/10 text-rausch" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}>
          People <span className="text-[10.5px] font-semibold text-green">· {onlineCount} online</span>
        </button>
      </div>

      <div className="p-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gray)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === "chats" ? "Search conversations" : "Search people"} className="field-input py-1.5 pl-8 text-[12.5px]" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {tab === "chats"
          ? filteredConversations.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                  activeId === c.id ? "bg-rausch/10" : "hover:bg-[var(--bg-2)]"
                )}
              >
                <button onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className="relative flex-none">
                    {c.type === "DM" ? (
                      <ChatAvatar name={c.name ?? "?"} avatarUrl={c.members[0]?.avatarUrl ?? null} avatarColor={c.members[0]?.avatarColor ?? "#FF385C"} size={36} />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-rausch/20 to-gold/20 text-[15px]">
                        {c.type === "TEAM" ? "🏡" : "👥"}
                      </span>
                    )}
                    {c.unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-[var(--card)]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[13px] font-extrabold">{c.favorited && "⭐ "}{c.name}</span>
                      {c.lastMessage && <span className="flex-none text-[10px] text-[var(--gray)]">{relativeTime(c.lastMessage.createdAt)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-1">
                      {c.typingUserNames.length > 0 ? (
                        <span className="flex items-center gap-1 truncate text-[11.5px] font-semibold italic text-teal">
                          <span className="flex gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-teal" style={{ animationDelay: "0ms" }} />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-teal" style={{ animationDelay: "120ms" }} />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-teal" style={{ animationDelay: "240ms" }} />
                          </span>
                          {c.typingUserNames.join(", ")} typing…
                        </span>
                      ) : (
                        <span className="truncate text-[11.5px] text-[var(--gray)]">
                          {c.lastMessage ? `${c.lastMessage.senderName}: ${c.lastMessage.body}` : "No messages yet"}
                        </span>
                      )}
                      {c.unreadCount > 0 && (
                        <span className="flex-none animate-pop-in rounded-full bg-rausch px-1.5 py-0.5 text-[10px] font-extrabold text-white transition-all">{c.unreadCount}</span>
                      )}
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => onToggleFavorite(c.id)}
                  title={c.favorited ? "Unpin" : "Pin conversation"}
                  className={cn(
                    "grid h-7 w-7 flex-none place-items-center rounded-full opacity-0 transition group-hover:opacity-100",
                    c.favorited ? "text-gold opacity-100" : "text-[var(--gray)] hover:bg-[var(--bg-2)]"
                  )}
                >
                  <PinIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          : filteredPeople.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
                <div className="relative flex-none">
                  <ChatAvatar name={p.name} avatarUrl={p.avatarUrl} avatarColor={p.avatarColor} size={36} />
                  <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot status={p.status} size={11} /></span>
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-extrabold">{p.name}</span>
                  <span className="block truncate text-[11px] text-[var(--gray)]">
                    {p.statusNote || (p.isTyping ? "typing…" : STATUS_LABEL[p.status])}
                  </span>
                </span>
                <button onClick={() => onStartDm(p.id)} title={`Message ${p.name}`} className="grid h-7 w-7 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch">
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
      </div>
    </div>
  );
}
