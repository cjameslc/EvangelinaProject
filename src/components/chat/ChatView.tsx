"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { RightPanel } from "./RightPanel";
import { AnnouncementBanner, BroadcastComposer } from "./AnnouncementBanner";
import { InfoIcon, MegaphoneIcon } from "@/components/ui/Icons";
import { usePolling } from "@/lib/chat/usePolling";
import type { ChatMessageData, ConversationSummary, PresenceUser, AnnouncementData } from "@/lib/chat/clientTypes";

export function ChatView({
  currentUserId, isAdmin, initialConversations,
}: {
  currentUserId: string;
  isAdmin: boolean;
  initialConversations: ConversationSummary[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  const [pinned, setPinned] = useState<ChatMessageData[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [editing, setEditing] = useState<ChatMessageData | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Conversation list — unread counts, last-message previews.
  usePolling(async (signal) => {
    const res = await fetch("/api/chat/conversations", { signal });
    if (res.ok) setConversations(await res.json());
  }, 8000, []);

  // Team presence.
  usePolling(async (signal) => {
    const res = await fetch("/api/chat/presence", { signal });
    if (res.ok) setPresence(await res.json());
  }, 8000, []);

  // Active announcements banner.
  usePolling(async (signal) => {
    const res = await fetch("/api/chat/announcements", { signal });
    if (res.ok) setAnnouncements(await res.json());
  }, 20000, []);

  // Messages in the open conversation — the fast-cadence poll, since this
  // is the one thing that needs to feel closest to real-time.
  const loadLatest = useCallback(async (signal: AbortSignal) => {
    if (!activeId) return;
    const res = await fetch(`/api/chat/conversations/${activeId}/messages`, { signal });
    if (res.ok) {
      const data: ChatMessageData[] = await res.json();
      setMessages(data);
      setHasMore(data.length >= 40);
    }
  }, [activeId]);
  usePolling(loadLatest, 4000, [activeId]);

  // Reset per-conversation UI state and mark read whenever the selection
  // changes (not on every poll tick).
  useEffect(() => {
    if (!activeId) return;
    setReplyTo(null);
    setEditing(null);
    setMessages([]);
    fetch(`/api/chat/conversations/${activeId}/read`, { method: "POST" }).catch(() => {});
    fetch(`/api/chat/conversations/${activeId}/pinned`).then((r) => (r.ok ? r.json() : [])).then(setPinned).catch(() => {});
  }, [activeId]);

  // Typing indicator for the open conversation.
  usePolling(async (signal) => {
    if (!activeId) return;
    const res = await fetch(`/api/chat/conversations/${activeId}/typing`, { signal });
    if (res.ok) setTypingUsers(await res.json());
  }, 3000, [activeId]);

  async function loadOlder() {
    if (!activeId || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0].createdAt;
      const res = await fetch(`/api/chat/conversations/${activeId}/messages?before=${encodeURIComponent(oldest)}`);
      if (res.ok) {
        const older: ChatMessageData[] = await res.json();
        setMessages((prev) => [...older, ...prev]);
        setHasMore(older.length >= 40);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSend(body: string, imageUrl: string | null) {
    if (!activeId) return;
    const res = await fetch(`/api/chat/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, replyToId: replyTo?.id ?? null, imageUrl }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setReplyTo(null);
    }
  }

  async function handleSaveEdit(body: string) {
    if (!editing) return;
    const res = await fetch(`/api/chat/messages/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setEditing(null);
    }
  }

  async function handleDelete(m: ChatMessageData) {
    if (!confirm("Delete this message?")) return;
    const res = await fetch(`/api/chat/messages/${m.id}`, { method: "DELETE" });
    if (res.ok) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, deletedAt: new Date().toISOString() } : x)));
  }

  async function handleReact(m: ChatMessageData, emoji: string) {
    // Optimistic — toggling a reaction should feel instant, and the very
    // next poll (well under 5s) reconciles with the real server state
    // either way, so a rare race just self-corrects almost immediately.
    setMessages((prev) =>
      prev.map((x) => {
        if (x.id !== m.id) return x;
        const mine = x.reactions.find((r) => r.userId === currentUserId && r.emoji === emoji);
        return mine
          ? { ...x, reactions: x.reactions.filter((r) => r !== mine) }
          : { ...x, reactions: [...x.reactions, { id: `optimistic-${Date.now()}`, emoji, userId: currentUserId, user: { id: currentUserId, name: "You" } }] };
      })
    );
    await fetch(`/api/chat/messages/${m.id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  async function handlePin(m: ChatMessageData) {
    const res = await fetch(`/api/chat/messages/${m.id}/pin`, { method: "POST" });
    if (res.ok) {
      const { pinned: isPinned } = await res.json();
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: isPinned } : x)));
      if (activeId) fetch(`/api/chat/conversations/${activeId}/pinned`).then((r) => (r.ok ? r.json() : [])).then(setPinned).catch(() => {});
    }
  }

  function handleTyping() {
    if (!activeId) return;
    fetch(`/api/chat/conversations/${activeId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing: true }),
    }).catch(() => {});
  }

  async function handleStartDm(userId: string) {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const { conversationId } = await res.json();
      const listRes = await fetch("/api/chat/conversations");
      if (listRes.ok) setConversations(await listRes.json());
      setActiveId(conversationId);
    }
  }

  async function handleDismissAnnouncement(id: string) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/chat/announcements/${id}/dismiss`, { method: "POST" }).catch(() => {});
  }

  async function handleBroadcast(body: string, category: string) {
    const res = await fetch("/api/chat/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, category }),
    });
    if (res.ok) {
      const a = await res.json();
      setAnnouncements((prev) => [a, ...prev]);
    }
  }

  const presenceById = useMemo(() => new Map(presence.map((p) => [p.id, p])), [presence]);

  return (
    <div className="flex h-[calc(100dvh-60px)] flex-col overflow-hidden sm:h-[calc(100dvh-60px)]">
      <AnnouncementBanner announcements={announcements} onDismiss={handleDismissAnnouncement} />
      <div className="flex min-h-0 flex-1">
        <div className={activeId ? "hidden sm:flex" : "flex w-full sm:flex"}>
          <Sidebar
            conversations={conversations}
            presence={presence}
            activeId={activeId}
            onSelect={setActiveId}
            onStartDm={handleStartDm}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
          />
        </div>

        {active ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <button onClick={() => setActiveId(null)} className="mr-1 text-[13px] font-bold text-rausch sm:hidden">←</button>
                <span className="truncate text-[14.5px] font-extrabold">{active.name}</span>
                <span className="flex-none text-[11px] text-[var(--gray)]">{active.memberCount} member{active.memberCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-none items-center gap-1">
                {isAdmin && (
                  <button onClick={() => setShowBroadcast(true)} title="Broadcast to team" className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
                    <MegaphoneIcon className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setShowInfo((v) => !v)} title="Conversation info" className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
                  <InfoIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <MessageList
              messages={messages}
              currentUserId={currentUserId}
              members={active.members}
              canModerate={isAdmin}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadOlder}
              typingUsers={typingUsers}
              onReply={setReplyTo}
              onEdit={setEditing}
              onDelete={handleDelete}
              onReact={handleReact}
              onPin={handlePin}
            />

            <Composer
              conversationId={active.id}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
              onSend={handleSend}
              onTyping={handleTyping}
              editing={editing}
              onCancelEdit={() => setEditing(null)}
              onSaveEdit={handleSaveEdit}
            />
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-[13px] text-[var(--gray)] sm:flex">
            Select a conversation to start chatting.
          </div>
        )}

        {active && showInfo && (
          <RightPanel
            conversation={active}
            pinned={pinned}
            presenceById={presenceById}
            onClose={() => setShowInfo(false)}
            onJumpToMessage={() => {}}
          />
        )}
      </div>

      <BroadcastComposer open={showBroadcast} onClose={() => setShowBroadcast(false)} onPost={handleBroadcast} />
    </div>
  );
}
