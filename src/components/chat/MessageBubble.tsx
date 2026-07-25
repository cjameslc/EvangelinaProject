"use client";

import { useRef, useState } from "react";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { BookingCard } from "./BookingCard";
import { ReplyIcon, SmileIcon, EditIcon, TrashIcon, PinIcon, CloseIcon } from "@/components/ui/Icons";
import { REACTION_EMOJI } from "@/lib/chat/constants";
import type { ChatMessageData, ChatUser } from "@/lib/chat/clientTypes";

const MENTION_RE = /@([A-Za-z][A-Za-z'-]*)/g;
const QUICK_REACT = ["👍", "❤️"] as const;
const LONG_PRESS_MS = 450;

/** Splits a message body into plain-text/@mention segments — a mention
 * only highlights if it actually matches a real member's first name, so
 * "@" in ordinary text (an email, "meet @ 5pm") never gets colored. */
function renderBody(body: string, members: ChatUser[]) {
  const firstNames = new Set(members.map((m) => m.name.split(" ")[0].toLowerCase()));
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const name = match[1];
    if (!firstNames.has(name.toLowerCase())) continue;
    const idx = match.index!;
    if (idx > lastIndex) parts.push(body.slice(lastIndex, idx));
    parts.push(
      <span key={key++} className="rounded bg-rausch/15 px-1 font-bold text-rausch">@{name}</span>
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts.length > 0 ? parts : body;
}

export type ReadReceipt = { seenByNames: string[]; isGroup: boolean };

export function MessageBubble({
  message, isOwn, isFirstInGroup, isLastInGroup, members, onReply, onEdit, onDelete, onReact, onPin, canModerate, readReceipt,
}: {
  message: ChatMessageData;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  members: ChatUser[];
  onReply: (m: ChatMessageData) => void;
  onEdit: (m: ChatMessageData) => void;
  onDelete: (m: ChatMessageData) => void;
  onReact: (m: ChatMessageData, emoji: string) => void;
  onPin: (m: ChatMessageData) => void;
  /** Owner/Admin can delete/pin anyone's message, not just their own. */
  canModerate: boolean;
  /** Only set on this conversation's most recent own message. */
  readReceipt?: ReadReceipt;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [hover, setHover] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const bookingRef = message.bookingRef;
  const editableWindow = Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000;

  const reactionGroups = message.reactions.reduce<Record<string, { count: number; names: string[] }>>((acc, r) => {
    acc[r.emoji] ??= { count: 0, names: [] };
    acc[r.emoji].count++;
    acc[r.emoji].names.push(r.user.name);
    return acc;
  }, {});

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setShowPicker(true), LONG_PRESS_MS);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  if (message.deletedAt) {
    return (
      <div className={cn("flex items-end gap-2 px-4", isFirstInGroup ? "mt-2.5" : "mt-0.5", isOwn && "flex-row-reverse")}>
        <div style={{ width: 28 }} />
        <p className="rounded-2xl bg-[var(--bg-2)] px-3 py-1.5 text-[12.5px] italic text-[var(--gray)]">Message deleted</p>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex items-end gap-2 px-4 transition-colors", isFirstInGroup ? "mt-2.5" : "mt-0.5", isOwn && "flex-row-reverse", message.pinned && "bg-gold/5")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowPicker(false); }}
    >
      {/* Avatar gutter — only others' messages show an avatar (on the first
          bubble of a consecutive group); own messages never show one
          (standard Messenger-style convention), but keep the same width so
          bubbles from both sides still line up. */}
      <div className="w-7 flex-none">
        {!isOwn && isFirstInGroup && <ChatAvatar name={message.sender.name} avatarUrl={message.sender.avatarUrl} avatarColor={message.sender.avatarColor} size={28} />}
      </div>

      <div className={cn("flex min-w-0 max-w-[76%] flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && isFirstInGroup && (
          <span className="mb-0.5 ml-1 text-[11.5px] font-extrabold text-[var(--gray)]">{message.sender.name}</span>
        )}

        {message.replyTo && (
          <div className="mb-1 flex max-w-full items-center gap-1.5 rounded-lg border-l-2 border-rausch/40 bg-[var(--bg-2)] px-2 py-1 text-[11.5px] text-[var(--gray)]">
            <ReplyIcon className="h-3 w-3 flex-none" />
            <span className="truncate">
              <span className="font-bold">{message.replyTo.sender.name}:</span> {message.replyTo.deletedAt ? "message deleted" : message.replyTo.body}
            </span>
          </div>
        )}

        <div
          onDoubleClick={() => onReact(message, "👍")}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onClick={() => setShowTime((v) => !v)}
          className={cn(
            "relative max-w-full cursor-pointer select-none whitespace-pre-wrap break-words px-3.5 py-2 text-[13.5px] leading-snug shadow-sm transition active:scale-[0.99]",
            isOwn ? "rounded-2xl bg-rausch text-white" : "rounded-2xl bg-[var(--bg-2)] text-[var(--ink)]",
            // Flattened corner toward the sender's own avatar side, on the
            // group's edge bubbles — the classic messenger "tail" cue.
            !isFirstInGroup && (isOwn ? "rounded-tr-md" : "rounded-tl-md"),
            !isLastInGroup && (isOwn ? "rounded-br-md" : "rounded-bl-md")
          )}
        >
          {message.body && <span>{renderBody(message.body, members)}</span>}
          {message.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={message.imageUrl} alt="Shared image" className={cn("max-h-[280px] rounded-xl object-cover", message.body && "mt-1.5")} />
          )}
          {message.editedAt && <span className={cn("ml-1.5 text-[10px]", isOwn ? "text-white/70" : "text-[var(--gray)]")}>(edited)</span>}
        </div>

        {bookingRef && <div className="mt-1 max-w-full"><BookingCard confirmationNumber={bookingRef} /></div>}

        {(showTime || isLastInGroup) && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] font-semibold text-[var(--gray)]">
            {fmtTime(message.createdAt)}
            {message.pinned && <PinIcon className="h-2.5 w-2.5 text-gold" />}
          </span>
        )}

        {Object.keys(reactionGroups).length > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", isOwn && "justify-end")}>
            {Object.entries(reactionGroups).map(([emoji, g]) => (
              <button
                key={emoji}
                onClick={() => onReact(message, emoji)}
                title={g.names.join(", ")}
                className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--card)] px-1.5 py-0.5 text-[11.5px] transition hover:border-rausch/40 hover:bg-rausch/5"
              >
                <span className="animate-pop-in">{emoji}</span>
                <span className="font-bold text-[var(--gray)]">{g.count}</span>
              </button>
            ))}
          </div>
        )}

        {readReceipt && (
          <span className="mt-0.5 px-1 text-[10.5px] text-[var(--gray)]">
            {readReceipt.seenByNames.length === 0
              ? "Sent"
              : readReceipt.isGroup
              ? `Seen by ${readReceipt.seenByNames.slice(0, 3).join(", ")}${readReceipt.seenByNames.length > 3 ? ` +${readReceipt.seenByNames.length - 3}` : ""}`
              : "Seen"}
          </span>
        )}
      </div>

      {/* Quick actions — instant one-click react (top emoji shown directly,
          no picker needed), Reply/Edit/Delete/Pin, and the full picker for
          anything else. Long-press (touch) / double-click the bubble also
          instantly reacts 👍, matching mobile chat conventions. */}
      <div className={cn("relative flex flex-none items-center gap-0.5 self-center opacity-0 transition-opacity", hover && "opacity-100")}>
        {QUICK_REACT.map((e) => (
          <button key={e} onClick={() => onReact(message, e)} title={`React ${e}`} className="grid h-7 w-7 place-items-center rounded-full text-[14px] transition hover:scale-125 hover:bg-[var(--bg-2)]">
            {e}
          </button>
        ))}
        <button onClick={() => onReply(message)} title="Reply" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
          <ReplyIcon className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setShowPicker((v) => !v)} title="More reactions" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
          <SmileIcon className="h-3.5 w-3.5" />
        </button>
        {isOwn && editableWindow && (
          <button onClick={() => onEdit(message)} title="Edit" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
            <EditIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {(isOwn || canModerate) && (
          <button onClick={() => onDelete(message)} title="Delete" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch">
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => onPin(message)} title={message.pinned ? "Unpin" : "Pin"} className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-gold/10 hover:text-gold">
          <PinIcon className="h-3.5 w-3.5" />
        </button>

        {showPicker && (
          <div className={cn("absolute top-8 z-10 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card animate-fade-up", isOwn ? "left-0" : "right-0")} style={{ width: 168 }}>
            {REACTION_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => { onReact(message, e); setShowPicker(false); }}
                className="grid h-7 w-7 place-items-center rounded-lg text-[16px] transition hover:scale-125 hover:bg-[var(--bg-2)]"
              >
                {e}
              </button>
            ))}
            <button onClick={() => setShowPicker(false)} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)]" aria-label="Close">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
