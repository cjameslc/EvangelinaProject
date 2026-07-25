"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, SendIcon, ImageIcon, ReplyIcon } from "@/components/ui/Icons";
import type { ChatMessageData } from "@/lib/chat/clientTypes";

export function Composer({
  conversationId, replyTo, onClearReply, onSend, onTyping, editing, onCancelEdit, onSaveEdit,
}: {
  conversationId: string;
  replyTo: ChatMessageData | null;
  onClearReply: () => void;
  onSend: (body: string, imageUrl: string | null) => Promise<void>;
  onTyping: () => void;
  editing: ChatMessageData | null;
  onCancelEdit: () => void;
  onSaveEdit: (body: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) { setValue(editing.body); taRef.current?.focus(); }
  }, [editing]);

  async function submit() {
    const body = value.trim();
    if (!body && !pendingImage) return;
    setSending(true);
    try {
      if (editing) {
        await onSaveEdit(body);
      } else {
        await onSend(body, pendingImage);
      }
      setValue("");
      setPendingImage(null);
    } finally {
      setSending(false);
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("conversationId", conversationId);
      const res = await fetch("/api/chat/upload", { method: "POST", body: form });
      const j = await res.json();
      if (res.ok) setPendingImage(j.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-t border-[var(--line)] bg-[var(--card)] p-3">
      {editing && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber/10 px-3 py-1.5 text-[12px] font-semibold text-amber">
          <span>Editing message</span>
          <button onClick={() => { onCancelEdit(); setValue(""); }}><CloseIcon className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {!editing && replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-2)] px-3 py-1.5 text-[12px]">
          <span className="flex min-w-0 items-center gap-1.5 text-[var(--gray)]">
            <ReplyIcon className="h-3.5 w-3.5 flex-none" />
            <span className="truncate">Replying to <span className="font-bold text-[var(--ink)]">{replyTo.sender.name}</span>: {replyTo.body}</span>
          </span>
          <button onClick={onClearReply}><CloseIcon className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {pendingImage && (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage} alt="Attachment preview" className="h-14 w-14 rounded-lg object-cover" />
          <button onClick={() => setPendingImage(null)} className="text-[11.5px] font-bold text-rausch">Remove</button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Attach an image"
          className="grid h-10 w-10 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] disabled:opacity-50"
        >
          <ImageIcon className="h-4.5 w-4.5" />
        </button>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); onTyping(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Message… try @Name or #EVA-XXXXXX for a booking"
          rows={1}
          className="field-input max-h-32 flex-1 resize-none py-2.5"
        />
        <button
          onClick={submit}
          disabled={sending || uploading || (!value.trim() && !pendingImage)}
          className="btn-primary !h-10 !w-10 flex-none !rounded-full !p-0 disabled:opacity-40"
          aria-label="Send"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
