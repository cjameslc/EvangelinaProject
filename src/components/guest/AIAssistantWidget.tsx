"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellIcon } from "@/components/ui/Icons";
import { CONCIERGE_SAMPLE_QUESTIONS } from "@/lib/guidebookContent";

type Message = { role: "user" | "assistant"; text: string; escalate?: boolean };

/** Dispatched by the Digital Guidebook's "Ask the AI Concierge" card so one
 * button opens this same widget instead of building a second chat UI. */
export const OPEN_CONCIERGE_EVENT = "open-ai-concierge";

// Rendered globally (see layout.tsx) but only ever shows for someone
// without a staff session — staff never see this, it's guest-only, exactly
// like the rest of the Guest Portal chrome.
export function AIAssistantWidget() {
  const { data: session } = useSession();
  const pathname = usePathname();
  // /o/[ownerSlug]/... is the only owner-prefixed part of the guest site
  // (see src/app/o/[ownerSlug]) — tells the assistant which owner's data to
  // answer from when there's no signed-in guest session to derive one from.
  const ownerSlugMatch = pathname?.match(/^\/o\/([^/]+)/);
  const ownerSlug = ownerSlugMatch ? ownerSlugMatch[1] : null;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi! I'm your AI Concierge — ask me about your stay, WiFi, the door code, or anything nearby." },
  ]);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener(OPEN_CONCIERGE_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_CONCIERGE_EVENT, openHandler);
  }, []);

  if (session) return null;

  async function sendMessage(text: string) {
    if (!text || sending) return;
    setInput("");
    // The turn history sent to Gemini — everything already on screen before
    // this new message, not counting the placeholder greeting (index 0),
    // which was never actually said by the model mid-conversation.
    const history = messages.slice(1).map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), text: m.text }));
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const res = await fetch("/api/guest/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, ownerSlug }),
      });
      const j = await res.json().catch(() => ({ reply: "Sorry, something went wrong." }));
      setMessages((m) => [...m, { role: "assistant", text: j.reply, escalate: j.escalate }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setSending(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    await sendMessage(text);
  }

  async function escalate(question: string) {
    if (escalating) return;
    setEscalating(true);
    try {
      await fetch("/api/guest/assistant/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      setMessages((m) => [...m, { role: "assistant", text: "Done — I've flagged this for our team, they'll follow up." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Couldn't reach our team right now — please try again." }]);
    } finally {
      setEscalating(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat with the AI Concierge"
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-rausch text-white shadow-card transition hover:brightness-95"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[520px] w-[340px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <div className="text-[13.5px] font-extrabold">🤖 AI Concierge</div>
            <div className="text-[11px] text-[var(--gray)]">Evangelina&apos;s Staycation</div>
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
            {messages.length === 1 && !sending && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CONCIERGE_SAMPLE_QUESTIONS.slice(0, 4).map((q) => (
                  <button key={q} onClick={() => sendMessage(q)} className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11px] font-semibold transition hover:bg-rausch/10 hover:text-rausch">
                    {q}
                  </button>
                ))}
              </div>
            )}
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
