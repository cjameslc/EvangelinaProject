"use client";

import { useEffect, useRef } from "react";
import { fmtDate } from "@/lib/format";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessageData, ChatUser } from "@/lib/chat/clientTypes";

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function MessageList({
  messages, currentUserId, members, canModerate, hasMore, loadingMore, onLoadMore, typingUsers,
  onReply, onEdit, onDelete, onReact, onPin,
}: {
  messages: ChatMessageData[];
  currentUserId: string;
  members: ChatUser[];
  canModerate: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  typingUsers: { id: string; name: string }[];
  onReply: (m: ChatMessageData) => void;
  onEdit: (m: ChatMessageData) => void;
  onDelete: (m: ChatMessageData) => void;
  onReact: (m: ChatMessageData, emoji: string) => void;
  onPin: (m: ChatMessageData) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const prevLastId = useRef<string | null>(null);
  const prevScrollHeight = useRef(0);

  // Auto-scroll to bottom only when a genuinely NEW message arrives (not
  // when older history loads at the top, which would otherwise yank the
  // view down right as someone's reading further back).
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId && lastId !== prevLastId.current) {
      const el = scrollRef.current;
      const wasNearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 200 : true;
      if (wasNearBottom || prevLastId.current === null) {
        bottomAnchorRef.current?.scrollIntoView({ behavior: prevLastId.current === null ? "auto" : "smooth" });
      }
    }
    prevLastId.current = lastId;
  }, [messages]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 80) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadMore();
    }
  }

  // Preserve scroll position when older messages are prepended.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !prevScrollHeight.current) return;
    el.scrollTop = el.scrollHeight - prevScrollHeight.current;
    prevScrollHeight.current = 0;
  }, [messages]);

  let lastDay = "";

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2">
      {loadingMore && <div className="py-2 text-center text-[11.5px] text-[var(--gray)]">Loading earlier messages…</div>}
      {messages.length === 0 && !loadingMore && (
        <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[var(--gray)]">
          No messages yet — say hello 👋
        </div>
      )}
      {messages.map((m) => {
        const day = dayKey(m.createdAt);
        const showDivider = day !== lastDay;
        lastDay = day;
        return (
          <div key={m.id}>
            {showDivider && (
              <div className="my-2 flex items-center gap-3 px-4">
                <div className="h-px flex-1 bg-[var(--line)]" />
                <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">{fmtDate(m.createdAt, { month: "long", day: "numeric" })}</span>
                <div className="h-px flex-1 bg-[var(--line)]" />
              </div>
            )}
            <MessageBubble
              message={m}
              isOwn={m.senderId === currentUserId}
              members={members}
              canModerate={canModerate}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onPin={onPin}
            />
          </div>
        );
      })}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-[12px] italic text-[var(--gray)]">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray)]" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray)]" style={{ animationDelay: "120ms" }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--gray)]" style={{ animationDelay: "240ms" }} />
          </span>
          {typingUsers.length === 1 ? `${typingUsers[0].name} is typing…` : `${typingUsers.map((u) => u.name).join(", ")} are typing…`}
        </div>
      )}
      <div ref={bottomAnchorRef} />
    </div>
  );
}
