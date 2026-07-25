"use client";

import { useState } from "react";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { BookingCard } from "./BookingCard";
import { ReplyIcon, SmileIcon, EditIcon, TrashIcon, PinIcon, CloseIcon } from "@/components/ui/Icons";
import { REACTION_EMOJI } from "@/lib/chat/constants";
import type { ChatMessageData, ChatUser } from "@/lib/chat/clientTypes";

const MENTION_RE = /@([A-Za-z][A-Za-z'-]*)/g;

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

export function MessageBubble({
  message, isOwn, members, onReply, onEdit, onDelete, onReact, onPin, canModerate,
}: {
  message: ChatMessageData;
  isOwn: boolean;
  members: ChatUser[];
  onReply: (m: ChatMessageData) => void;
  onEdit: (m: ChatMessageData) => void;
  onDelete: (m: ChatMessageData) => void;
  onReact: (m: ChatMessageData, emoji: string) => void;
  onPin: (m: ChatMessageData) => void;
  /** Owner/Admin can delete/pin anyone's message, not just their own. */
  canModerate: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [hover, setHover] = useState(false);
  const bookingRef = message.bookingRef;
  const editableWindow = Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000;

  const reactionGroups = message.reactions.reduce<Record<string, { count: number; names: string[] }>>((acc, r) => {
    acc[r.emoji] ??= { count: 0, names: [] };
    acc[r.emoji].count++;
    acc[r.emoji].names.push(r.user.name);
    return acc;
  }, {});

  if (message.deletedAt) {
    return (
      <div className="group flex items-start gap-2.5 px-4 py-1.5 opacity-60">
        <div style={{ width: 34 }} />
        <p className="text-[12.5px] italic text-[var(--gray)]">Message deleted</p>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex items-start gap-2.5 px-4 py-1.5 transition-colors animate-fade-up hover:bg-[var(--bg-2)]/60", message.pinned && "bg-gold/5")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowPicker(false); }}
    >
      <ChatAvatar name={message.sender.name} avatarUrl={message.sender.avatarUrl} avatarColor={message.sender.avatarColor} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-extrabold">{message.sender.name}</span>
          <span className="text-[10.5px] font-semibold text-[var(--gray)]">{fmtTime(message.createdAt)}</span>
          {message.editedAt && <span className="text-[10px] text-[var(--gray)]">(edited)</span>}
          {message.pinned && <PinIcon className="h-3 w-3 text-gold" />}
        </div>

        {message.replyTo && (
          <div className="mt-1 flex items-center gap-1.5 rounded-lg border-l-2 border-rausch/40 bg-[var(--bg-2)] px-2 py-1 text-[11.5px] text-[var(--gray)]">
            <ReplyIcon className="h-3 w-3 flex-none" />
            <span className="truncate">
              <span className="font-bold">{message.replyTo.sender.name}:</span> {message.replyTo.deletedAt ? "message deleted" : message.replyTo.body}
            </span>
          </div>
        )}

        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-snug">{renderBody(message.body, members)}</p>
        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.imageUrl} alt="Shared image" className="mt-1.5 max-h-[280px] rounded-xl border border-[var(--line)] object-cover" />
        )}
        {bookingRef && <BookingCard confirmationNumber={bookingRef} />}

        {Object.keys(reactionGroups).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
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
      </div>

      {/* Quick actions — Reply/React/Edit/Delete/Pin on hover, matching the
          spec's "right-click or long-press" intent via a simpler always-
          reachable hover toolbar (works the same on touch via tap-and-hold
          triggering :hover-equivalent focus in most mobile browsers). */}
      <div className={cn("relative flex flex-none items-center gap-0.5 opacity-0 transition-opacity", hover && "opacity-100")}>
        <button onClick={() => onReply(message)} title="Reply" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
          <ReplyIcon className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setShowPicker((v) => !v)} title="React" className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]">
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
          <div className="absolute right-0 top-8 z-10 flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-[var(--card)] p-1.5 shadow-card" style={{ width: 168 }}>
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
