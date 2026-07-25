"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { MegaphoneIcon, CloseIcon } from "@/components/ui/Icons";
import { ANNOUNCEMENT_LABEL } from "@/lib/chat/constants";
import { cn } from "@/lib/utils";
import type { AnnouncementData } from "@/lib/chat/clientTypes";

const CATEGORY_STYLE: Record<string, string> = {
  URGENT: "bg-rausch/10 border-rausch/30 text-rausch",
  MAINTENANCE: "bg-amber/10 border-amber/30 text-amber",
  POLICY: "bg-violet/10 border-violet/30 text-violet",
  ANNOUNCEMENT: "bg-teal/10 border-teal/30 text-teal",
};

export function AnnouncementBanner({ announcements, onDismiss }: { announcements: AnnouncementData[]; onDismiss: (id: string) => void }) {
  if (announcements.length === 0) return null;
  return (
    <div className="space-y-1.5 border-b border-[var(--line)] p-2">
      {announcements.map((a) => (
        <div key={a.id} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px]", CATEGORY_STYLE[a.category])}>
          <MegaphoneIcon className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span className="min-w-0 flex-1">
            <span className="mr-1.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide dark:bg-white/10">{ANNOUNCEMENT_LABEL[a.category]}</span>
            <span className="font-semibold text-[var(--ink)]">{a.body}</span>
            <span className="ml-1.5 text-[10.5px] text-[var(--gray)]">— {a.createdBy.name}</span>
          </span>
          <button onClick={() => onDismiss(a.id)} className="flex-none opacity-60 hover:opacity-100"><CloseIcon className="h-3.5 w-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

export function BroadcastComposer({ open, onClose, onPost }: { open: boolean; onClose: () => void; onPost: (body: string, category: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("ANNOUNCEMENT");
  const [posting, setPosting] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await onPost(body.trim(), category);
      setBody("");
      onClose();
    } finally {
      setPosting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Broadcast to the whole team" maxWidth={480}>
      <div className="space-y-3">
        <div>
          <label className="field-label">Category</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(ANNOUNCEMENT_LABEL).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={cn("rounded-full border px-2.5 py-1 text-[12px] font-bold transition", category === key ? "border-rausch bg-rausch/10 text-rausch" : "border-[var(--line)] text-[var(--gray)] hover:bg-[var(--bg-2)]")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="field-input mt-1.5" placeholder="Everyone will see this pinned until they dismiss it." />
        </div>
        <button onClick={submit} disabled={posting || !body.trim()} className="btn-primary w-full disabled:opacity-50">
          {posting ? "Sending…" : "Send to everyone"}
        </button>
      </div>
    </Modal>
  );
}
