"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { RightPanel } from "./RightPanel";
import { AnnouncementBanner, BroadcastComposer } from "./AnnouncementBanner";
import { ChatToastStack, type ChatToast } from "./ChatToastStack";
import { NotificationCenter, type NotificationEntry } from "./NotificationCenter";
import { InfoIcon, MegaphoneIcon, SpeakerIcon, SpeakerMuteIcon } from "@/components/ui/Icons";
import { usePolling } from "@/lib/chat/usePolling";
import { playNotificationSound, isSoundMuted, setSoundMuted } from "@/lib/chat/sound";
import type { ChatMessageData, ConversationSummary, PresenceUser, AnnouncementData } from "@/lib/chat/clientTypes";

/** Imperative escape hatch for embedders (e.g. the Bookings page's Team
 * Collaboration panel) that need to trigger a send or a favorite-toggle
 * from outside this component's own UI, without duplicating its state or
 * polling. Kept intentionally minimal — everything else (picking a
 * conversation, reading messages, replying) still happens through this
 * component's own rendered UI. */
export type ChatViewHandle = {
  sendQuickMessage: (body: string) => Promise<boolean>;
  pinActiveConversation: () => Promise<boolean>;
  activeConversationId: () => string | null;
};

export const ChatView = forwardRef<ChatViewHandle, {
  currentUserId: string;
  isAdmin: boolean;
  initialConversations: ConversationSummary[];
  /** Renders to fill its parent container (`h-full`) instead of the
   * standalone page's full-viewport height — used when this component is
   * embedded inside another page's layout (e.g. Bookings). Nothing else
   * about the component's internals — width, internal scroll areas,
   * responsive breakpoints — changes between the two modes. */
  embedded?: boolean;
  /** Fired every time the internal presence poll resolves, so an embedder
   * that also wants a live roster (e.g. a "Team Online" header) can reuse
   * this component's own poll instead of starting a second one. */
  onPresenceUpdate?: (presence: PresenceUser[]) => void;
}>(function ChatView({
  currentUserId, isAdmin, initialConversations, embedded, onPresenceUpdate,
}, ref) {
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
  const [unreadSnapshot, setUnreadSnapshot] = useState(0);
  const [seenByUsers, setSeenByUsers] = useState<{ id: string; name: string }[]>([]);
  const [toasts, setToasts] = useState<ChatToast[]>([]);
  const [notifLog, setNotifLog] = useState<NotificationEntry[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(true);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const lastReadMessageIdRef = useRef<string | null>(null);
  const prevConvSnapshotRef = useRef<Map<string, string | null>>(new Map());
  const prevPresenceRef = useRef<Map<string, string>>(new Map());
  const toastedOnlineRef = useRef<Map<string, number>>(new Map());
  const ONLINE_TOAST_COOLDOWN_MS = 10 * 60 * 1000;

  useEffect(() => setSoundMutedState(isSoundMuted()), []);

  // Conversation list — unread counts, last-message previews. Also the one
  // place that detects "a new message landed somewhere" for sound/toast/
  // notification-center purposes, since it already polls every conversation
  // (not just the open one).
  usePolling(async (signal) => {
    const res = await fetch("/api/chat/conversations", { signal });
    if (!res.ok) return;
    const data: ConversationSummary[] = await res.json();
    const prevSnapshot = prevConvSnapshotRef.current;
    const isFirstLoad = prevSnapshot.size === 0;

    if (!isFirstLoad) {
      for (const c of data) {
        const prevLastId = prevSnapshot.get(c.id);
        const lm = c.lastMessage;
        if (!lm || lm.id === prevLastId || lm.senderId === currentUserId) continue;

        const sender = c.members.find((m) => m.id === lm.senderId);
        // Notification Center logs every real new message regardless of
        // mute — muting only stops the interruption (sound/toast), it
        // shouldn't hide that something happened when you go check later.
        setNotifLog((prev) => [
          {
            id: `msg-${lm.id}`, conversationId: c.id, conversationName: c.name ?? "Conversation",
            senderName: lm.senderName, avatarUrl: sender?.avatarUrl ?? null, avatarColor: sender?.avatarColor ?? "#FF385C",
            preview: lm.body, createdAt: lm.createdAt,
          },
          ...prev,
        ].slice(0, 30));

        const isOpenAndFocused = c.id === activeId && document.visibilityState === "visible" && document.hasFocus();
        if (!isOpenAndFocused && !c.muted) {
          playNotificationSound();
          setToasts((prev) => [
            ...prev,
            {
              id: `toast-msg-${lm.id}`, kind: "message", conversationId: c.id,
              senderName: lm.senderName, avatarUrl: sender?.avatarUrl ?? null, avatarColor: sender?.avatarColor ?? "#FF385C",
              preview: lm.body, createdAt: lm.createdAt,
            },
          ]);
        }
      }
    }
    for (const c of data) prevSnapshot.set(c.id, c.lastMessage?.id ?? null);
    setConversations(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, 8000, []);

  // Team presence — also watches for OFFLINE → online transitions among
  // people the current user actually talks to (DM partners or favorited
  // conversations), so a whole-staff roster coming online in the morning
  // doesn't fire a toast storm for everyone.
  usePolling(async (signal) => {
    const res = await fetch("/api/chat/presence", { signal });
    if (!res.ok) return;
    const data: PresenceUser[] = await res.json();
    const prevMap = prevPresenceRef.current;
    const isFirstLoad = prevMap.size === 0;

    if (!isFirstLoad) {
      const relevantIds = new Set(conversations.filter((c) => c.type === "DM" || c.favorited).flatMap((c) => c.members.map((m) => m.id)));
      for (const p of data) {
        if (p.id === currentUserId || !relevantIds.has(p.id)) continue;
        const prevStatus = prevMap.get(p.id);
        if (prevStatus === "OFFLINE" && p.status !== "OFFLINE") {
          const lastToast = toastedOnlineRef.current.get(p.id) ?? 0;
          if (Date.now() - lastToast > ONLINE_TOAST_COOLDOWN_MS) {
            toastedOnlineRef.current.set(p.id, Date.now());
            setToasts((prev) => [...prev, { id: `toast-presence-${p.id}-${Date.now()}`, kind: "presence", userId: p.id, name: p.name, avatarUrl: p.avatarUrl, avatarColor: p.avatarColor }]);
          }
        }
      }
    }
    for (const p of data) prevMap.set(p.id, p.status);
    setPresence(data);
    onPresenceUpdate?.(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Reset per-conversation UI state whenever the selection changes. Marking
  // read no longer happens unconditionally here — see handleSeenLatest,
  // fired only once the newest message is actually visible + tab focused.
  useEffect(() => {
    if (!activeId) return;
    setReplyTo(null);
    setEditing(null);
    setMessages([]);
    setSeenByUsers([]);
    lastReadMessageIdRef.current = null;
    const conv = conversations.find((c) => c.id === activeId);
    setUnreadSnapshot(conv?.unreadCount ?? 0);
    fetch(`/api/chat/conversations/${activeId}/pinned`).then((r) => (r.ok ? r.json() : [])).then(setPinned).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Typing indicator for the open conversation.
  usePolling(async (signal) => {
    if (!activeId) return;
    const res = await fetch(`/api/chat/conversations/${activeId}/typing`, { signal });
    if (res.ok) setTypingUsers(await res.json());
  }, 3000, [activeId]);

  // Read receipts for the open conversation's own most recent message.
  const lastOwnMessageId = useMemo(
    () => [...messages].reverse().find((m) => m.senderId === currentUserId && !m.deletedAt)?.id ?? null,
    [messages, currentUserId]
  );
  usePolling(async (signal) => {
    if (!lastOwnMessageId) { setSeenByUsers([]); return; }
    const res = await fetch(`/api/chat/messages/${lastOwnMessageId}/seen`, { signal });
    if (res.ok) setSeenByUsers(await res.json());
  }, 5000, [lastOwnMessageId]);

  async function handleSeenLatest(messageId: string) {
    if (!activeId || lastReadMessageIdRef.current === messageId) return;
    lastReadMessageIdRef.current = messageId;
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)));
    await fetch(`/api/chat/conversations/${activeId}/read`, { method: "POST" }).catch(() => {});
  }

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

  async function handleToggleFavorite(conversationId: string) {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, favorited: !c.favorited } : c)));
    await fetch(`/api/chat/conversations/${conversationId}/favorite`, { method: "POST" }).catch(() => {});
  }

  async function handleToggleMute() {
    if (!activeId) return;
    setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, muted: !c.muted } : c)));
    await fetch(`/api/chat/conversations/${activeId}/mute`, { method: "POST" }).catch(() => {});
  }

  function handleToggleSound() {
    const next = !soundMuted;
    setSoundMuted(next);
    setSoundMutedState(next);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function jumpToConversation(conversationId: string) {
    setActiveId(conversationId);
    setNotifOpen(false);
  }

  async function handleMarkAllNotificationsRead() {
    const toMark = conversations.filter((c) => c.unreadCount > 0);
    setConversations((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })));
    await Promise.all(toMark.map((c) => fetch(`/api/chat/conversations/${c.id}/read`, { method: "POST" }).catch(() => {})));
  }

  const presenceById = useMemo(() => new Map(presence.map((p) => [p.id, p])), [presence]);
  const unreadConversationIds = useMemo(() => new Set(conversations.filter((c) => c.unreadCount > 0).map((c) => c.id)), [conversations]);

  useImperativeHandle(ref, () => ({
    sendQuickMessage: async (body: string) => {
      if (!activeId) return false;
      await handleSend(body, null);
      return true;
    },
    pinActiveConversation: async () => {
      if (!activeId) return false;
      await handleToggleFavorite(activeId);
      return true;
    },
    activeConversationId: () => activeId,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activeId]);

  return (
    <div className={embedded ? "flex h-full flex-col overflow-hidden" : "flex h-[calc(100dvh-60px)] flex-col overflow-hidden sm:h-[calc(100dvh-60px)]"}>
      <AnnouncementBanner announcements={announcements} onDismiss={handleDismissAnnouncement} />
      <div className="flex min-h-0 flex-1">
        <div className={activeId ? "hidden sm:flex" : "flex w-full sm:flex"}>
          <Sidebar
            conversations={conversations}
            presence={presence}
            activeId={activeId}
            onSelect={setActiveId}
            onStartDm={handleStartDm}
            onToggleFavorite={handleToggleFavorite}
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
                <button onClick={handleToggleSound} title={soundMuted ? "Unmute notification sounds" : "Mute notification sounds"} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
                  {soundMuted ? <SpeakerMuteIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
                </button>
                <NotificationCenter
                  open={notifOpen}
                  onToggle={() => setNotifOpen((v) => !v)}
                  entries={notifLog}
                  unreadConversationIds={unreadConversationIds}
                  onMarkAllRead={handleMarkAllNotificationsRead}
                  onClear={() => setNotifLog([])}
                  onJump={jumpToConversation}
                />
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
              conversationId={active.id}
              messages={messages}
              currentUserId={currentUserId}
              members={active.members}
              canModerate={isAdmin}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadOlder}
              typingUsers={typingUsers}
              unreadCountAtOpen={unreadSnapshot}
              onReply={setReplyTo}
              onEdit={setEditing}
              onDelete={handleDelete}
              onReact={handleReact}
              onPin={handlePin}
              onSeenLatest={handleSeenLatest}
              isGroup={active.type !== "DM"}
              seenByNames={seenByUsers.map((u) => u.name)}
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
            onToggleMute={handleToggleMute}
          />
        )}
      </div>

      <BroadcastComposer open={showBroadcast} onClose={() => setShowBroadcast(false)} onPost={handleBroadcast} />
      <ChatToastStack toasts={toasts} onDismiss={dismissToast} onJump={jumpToConversation} />
    </div>
  );
});
