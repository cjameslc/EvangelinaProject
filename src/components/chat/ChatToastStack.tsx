"use client";

import { useEffect, useState } from "react";
import { ChatAvatar } from "./ChatAvatar";
import { CloseIcon } from "@/components/ui/Icons";
import { PresenceDot } from "./PresenceDot";

export type ChatToast =
  | {
      id: string;
      kind: "message";
      conversationId: string;
      senderName: string;
      avatarUrl: string | null;
      avatarColor: string;
      preview: string;
      createdAt: string;
    }
  | { id: string; kind: "presence"; userId: string; name: string; avatarUrl: string | null; avatarColor: string };

const AUTO_DISMISS_MS = 5500;

function ToastCard({ toast, onDismiss, onClick }: { toast: ChatToast; onDismiss: () => void; onClick?: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const dismissAt = setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
    return () => clearTimeout(dismissAt);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDismiss, 200);
    return () => clearTimeout(t);
  }, [leaving, onDismiss]);

  return (
    <div
      onClick={onClick}
      className={`pointer-events-auto flex w-[300px] items-start gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-card transition-all duration-200 ${
        onClick ? "cursor-pointer hover:border-rausch/40" : ""
      } ${leaving ? "translate-x-4 opacity-0" : "animate-fade-up opacity-100"}`}
    >
      {toast.kind === "message" ? (
        <ChatAvatar name={toast.senderName} avatarUrl={toast.avatarUrl} avatarColor={toast.avatarColor} size={36} />
      ) : (
        <div className="relative flex-none">
          <ChatAvatar name={toast.name} avatarUrl={toast.avatarUrl} avatarColor={toast.avatarColor} size={36} />
          <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot status="ONLINE" size={11} /></span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {toast.kind === "message" ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] font-extrabold">{toast.senderName}</span>
              <span className="flex-none text-[10px] text-[var(--gray)]">now</span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-[var(--gray)]">{toast.preview || "📷 Sent an image"}</p>
          </>
        ) : (
          <p className="mt-1.5 text-[12.5px]"><span className="font-extrabold">{toast.name}</span> <span className="text-[var(--gray)]">just came online</span></p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setLeaving(true); }}
        className="grid h-5 w-5 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"
        aria-label="Dismiss"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

/** A stack of rich, dismissible toasts for new messages and "came online"
 * presence — separate from the app-wide single-line ui/Toast (that one's
 * plain text, one at a time; this needs avatars, click-to-jump, and several
 * stacked at once). Newest on top. */
export function ChatToastStack({ toasts, onDismiss, onJump }: { toasts: ChatToast[]; onDismiss: (id: string) => void; onJump: (conversationId: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[95] flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() => onDismiss(t.id)}
          onClick={t.kind === "message" ? () => { onJump(t.conversationId); onDismiss(t.id); } : undefined}
        />
      ))}
    </div>
  );
}
