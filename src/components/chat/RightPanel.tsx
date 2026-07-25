"use client";

import { ChatAvatar } from "./ChatAvatar";
import { PresenceDot } from "./PresenceDot";
import { PinIcon, CloseIcon, SpeakerIcon, SpeakerMuteIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import type { ConversationSummary, ChatMessageData, PresenceUser } from "@/lib/chat/clientTypes";

export function RightPanel({
  conversation, pinned, presenceById, onClose, onJumpToMessage, onToggleMute,
}: {
  conversation: ConversationSummary;
  pinned: ChatMessageData[];
  presenceById: Map<string, PresenceUser>;
  onClose: () => void;
  onJumpToMessage: (id: string) => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="flex h-full w-[260px] flex-none flex-col border-l border-[var(--line)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] p-3">
        <h3 className="text-[13.5px] font-extrabold">Conversation info</h3>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] sm:hidden">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-[var(--line)] p-3">
        <button
          onClick={onToggleMute}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12.5px] font-bold transition",
            conversation.muted ? "bg-amber/10 text-amber" : "text-[var(--gray)] hover:bg-[var(--bg-2)]"
          )}
        >
          <span className="flex items-center gap-2">
            {conversation.muted ? <SpeakerMuteIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
            {conversation.muted ? "Muted" : "Mute notifications"}
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-wide">{conversation.muted ? "Unmute" : "Mute"}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">
          Participants ({conversation.memberCount})
        </div>
        <div className="space-y-1.5">
          {conversation.members.map((m) => {
            const p = presenceById.get(m.id);
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div className="relative flex-none">
                  <ChatAvatar name={m.name} avatarUrl={m.avatarUrl} avatarColor={m.avatarColor} size={26} />
                  {p && <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot status={p.status} size={9} /></span>}
                </div>
                <span className="truncate text-[12px] font-semibold">{m.name}</span>
              </div>
            );
          })}
        </div>

        {pinned.length > 0 && (
          <>
            <div className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--gray)]">Pinned messages</div>
            <div className="space-y-2">
              {pinned.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onJumpToMessage(m.id)}
                  className="block w-full rounded-lg border border-gold/25 bg-gold/5 p-2 text-left transition hover:bg-gold/10"
                >
                  <div className="flex items-center gap-1 text-[10px] font-bold text-gold"><PinIcon className="h-3 w-3" /> {m.sender.name}</div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--ink)]">{m.body}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
