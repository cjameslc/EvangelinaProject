"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { BellIcon } from "@/components/ui/Icons";

type Message = { role: "user" | "assistant"; text: string; escalate?: boolean };

// Rendered globally (see layout.tsx) but only ever shows for someone
// without a staff session — staff never see this, it's guest-only, exactly
// like the rest of the Guest Portal chrome.
export function AIAssistantWidget() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi! I can help with availability, rates, and your booking status. What would you like to know?" },
  ]);
  const [sending, setSending] = useState(false);

  if (session) return null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    const res = await fetch("/api/guest/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const j = await res.json().catch(() => ({ reply: "Sorry, something went wrong." }));
    setSending(false);
    setMessages((m) => [...m, { role: "assistant", text: j.reply, escalate: j.escalate }]);
  }

  async function escalate(question: string) {
    await fetch("/api/guest/assistant/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }).catch(() => {});
    setMessages((m) => [...m, { role: "assistant", text: "Done — I've flagged this for our team, they'll follow up." }]);
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat with us"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-rausch text-white shadow-card transition hover:brightness-95"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[480px] w-[340px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="text-[13.5px] font-extrabold">Evangelina's Assistant</div>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] ${m.role === "user" ? "bg-rausch text-white" : "bg-[var(--bg-2)]"}`}>
                  {m.text}
                  {m.role === "assistant" && m.escalate && (
                    <button onClick={() => escalate(messages[i - 1]?.text ?? m.text)} className="mt-2 flex items-center gap-1 text-[11.5px] font-extrabold text-rausch">
                      <BellIcon className="h-3 w-3" /> Talk to a human
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="text-[12px] text-[var(--gray)]">Thinking…</div>}
          </div>
          <form onSubmit={send} className="flex items-center gap-2 border-t border-[var(--line)] p-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="field-input flex-1 !py-2 text-[13px]"
            />
            <button type="submit" disabled={sending} className="btn-primary !px-3 !py-2 text-[13px]">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
