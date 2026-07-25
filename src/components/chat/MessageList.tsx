"use client";

import { useEffect, useRef } from "react";
import { fmtDate } from "@/lib/format";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessageData, ChatUser } from "@/lib/chat/clientTypes";

const GROUP_GAP_MS = 4 * 60 * 1000;

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function MessageList({
  conversationId, messages, currentUserId, members, canModerate, hasMore, loadingMore, onLoadMore, typingUsers, unreadCountAtOpen,
  onReply, onEdit, onDelete, onReact, onPin, onSeenLatest, isGroup, seenByNames,
}: {
  /** Used only to detect "this is a different conversation than last
   * render" — MessageList doesn't unmount between conversations (ChatView
   * reuses the same instance), so a ref alone can't tell a fresh
   * conversation's first message apart from the previous one's last. */
  conversationId: string;
  messages: ChatMessageData[];
  currentUserId: string;
  members: ChatUser[];
  canModerate: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  typingUsers: { id: string; name: string }[];
  /** How many of this conversation's messages were unread the moment it was
   * opened — a fixed snapshot (not the live, ever-dropping-to-0 unread
   * count), used only to place the "Unread messages" divider and decide
   * where to auto-scroll on first load. */
  unreadCountAtOpen: number;
  onReply: (m: ChatMessageData) => void;
  onEdit: (m: ChatMessageData) => void;
  onDelete: (m: ChatMessageData) => void;
  onReact: (m: ChatMessageData, emoji: string) => void;
  onPin: (m: ChatMessageData) => void;
  /** Fired (at most once per new latest message) once that message is
   * actually visible in the viewport while the tab is focused/visible —
   * the "strict" mark-as-read trigger, called by the parent to hit the
   * read API. */
  onSeenLatest: (messageId: string) => void;
  /** Whether "Seen" should read as "Seen by X, Y" (GROUP/TEAM) vs a plain
   * "Seen" (DM, one other person only). */
  isGroup: boolean;
  /** Who has read the conversation's most recent own message — polled by
   * the parent, rendered only under that one message. */
  seenByNames: string[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const prevLastId = useRef<string | null>(null);
  const prevConversationId = useRef<string | null>(null);
  const dividerMessageId = useRef<string | null>(null);
  const prevScrollHeight = useRef(0);
  const isIntersectingRef = useRef(false);

  // A new conversation was selected — MessageList itself doesn't remount
  // (ChatView keeps one instance across selections), so this is the only
  // reliable "starting fresh" signal. Forces the next messages update to be
  // treated as a first paint, and freezes the unread-divider's target
  // message id once, from the snapshot taken at open — recomputing it from
  // unreadCountAtOpen + messages.length on every later poll would make the
  // divider drift forward as new messages arrive in the same session.
  if (conversationId !== prevConversationId.current) {
    prevConversationId.current = conversationId;
    prevLastId.current = null;
    dividerMessageId.current = null;
  }
  if (dividerMessageId.current === null && unreadCountAtOpen > 0 && messages.length > 0) {
    const idx = messages.length - unreadCountAtOpen;
    if (idx >= 0 && idx < messages.length) dividerMessageId.current = messages[idx].id;
  }

  // Auto-scroll to bottom when a genuinely NEW message arrives (not when
  // older history loads at the top). On a conversation's first paint, jump
  // to the "Unread messages" divider instead of the very bottom if there
  // are unread messages to catch up on.
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId && lastId !== prevLastId.current) {
      const isFirstPaint = prevLastId.current === null;
      if (isFirstPaint && dividerRef.current) {
        dividerRef.current.scrollIntoView({ behavior: "auto", block: "center" });
      } else {
        const el = scrollRef.current;
        const wasNearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 200 : true;
        if (wasNearBottom || isFirstPaint) {
          bottomAnchorRef.current?.scrollIntoView({ behavior: isFirstPaint ? "auto" : "smooth" });
        }
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

  // Strict mark-as-read: only once the newest message is actually visible
  // in the viewport AND the tab is genuinely focused/visible — re-checked
  // on visibility/focus changes too, so a message that arrived while the
  // tab was backgrounded gets marked the moment someone actually looks.
  useEffect(() => {
    const el = bottomAnchorRef.current;
    const lastId = messages[messages.length - 1]?.id;
    if (!el || !lastId) return;
    let notified = false;
    const check = () => {
      if (notified) return;
      if (isIntersectingRef.current && document.visibilityState === "visible" && document.hasFocus()) {
        notified = true;
        onSeenLatest(lastId);
      }
    };
    const observer = new IntersectionObserver(([entry]) => { isIntersectingRef.current = entry.isIntersecting; check(); }, { threshold: 0.6 });
    observer.observe(el);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [messages, onSeenLatest]);

  let lastDay = "";
  const lastOwnMessageId = [...messages].reverse().find((m) => m.senderId === currentUserId && !m.deletedAt)?.id ?? null;

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2">
      {loadingMore && <div className="py-2 text-center text-[11.5px] text-[var(--gray)]">Loading earlier messages…</div>}
      {messages.length === 0 && !loadingMore && (
        <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[var(--gray)]">
          No messages yet — say hello 👋
        </div>
      )}
      {messages.map((m, i) => {
        const day = dayKey(m.createdAt);
        const showDayDivider = day !== lastDay;
        lastDay = day;

        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isFirstInGroup =
          showDayDivider || !prev || prev.senderId !== m.senderId || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS;
        const isLastInGroup =
          !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== day || new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > GROUP_GAP_MS;

        const showUnreadDivider = m.id === dividerMessageId.current;

        return (
          <div key={m.id}>
            {showDayDivider && (
              <div className="my-2 flex items-center gap-3 px-4">
                <div className="h-px flex-1 bg-[var(--line)]" />
                <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">{fmtDate(m.createdAt, { month: "long", day: "numeric" })}</span>
                <div className="h-px flex-1 bg-[var(--line)]" />
              </div>
            )}
            {showUnreadDivider && (
              <div ref={dividerRef} className="my-2 flex items-center gap-3 px-4">
                <div className="h-px flex-1 bg-rausch/40" />
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-rausch">Unread messages</span>
                <div className="h-px flex-1 bg-rausch/40" />
              </div>
            )}
            <MessageBubble
              message={m}
              isOwn={m.senderId === currentUserId}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              members={members}
              canModerate={canModerate}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onPin={onPin}
              readReceipt={m.id === lastOwnMessageId ? { seenByNames, isGroup } : undefined}
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
