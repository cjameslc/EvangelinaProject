"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { fmtDate, fmtTime } from "@/lib/format";
import { ShieldIcon, SearchIcon } from "@/components/ui/Icons";

type Stats = {
  totalMessages: number;
  totalConversations: number;
  messagesToday: number;
  byType: Record<string, number>;
  mostActive: { userId: string; name: string; messageCount: number }[];
};

type AuditMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  bookingRef: string | null;
  sender: { id: string; name: string; role: string };
  conversation: { id: string; type: string; name: string | null };
};

export function AuditView({ initialStats, users }: { initialStats: Stats; users: { id: string; name: string }[] }) {
  const [stats] = useState(initialStats);
  const [keyword, setKeyword] = useState("");
  const [userId, setUserId] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(true);
  const [results, setResults] = useState<AuditMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (userId) params.set("userId", userId);
      if (bookingRef) params.set("bookingRef", bookingRef);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (includeDeleted) params.set("includeDeleted", "true");
      const res = await fetch(`/api/chat/audit?${params.toString()}`);
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runSearch(); /* initial load — an empty filter set returns the most recent 100 messages */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2.5">
        <ShieldIcon className="h-6 w-6 text-rausch" />
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Chat Audit Center</h1>
          <p className="text-[13px] text-[var(--gray)]">Every conversation, including private DMs — search, filter, and review edit/delete history.</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total messages" value={stats.totalMessages} sub="all conversations" />
        <StatCard label="Messages today" value={stats.messagesToday} sub="since midnight" />
        <StatCard label="Conversations" value={stats.totalConversations} sub={`${stats.byType.TEAM ?? 0} team · ${stats.byType.GROUP ?? 0} group · ${stats.byType.DM ?? 0} DM`} />
        <StatCard label="Most active (7d)" value={stats.mostActive[0]?.name ?? "—"} sub={stats.mostActive[0] ? `${stats.mostActive[0].messageCount} messages` : "no activity"} />
      </div>

      <div className="card mb-5 p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gray)]" />
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword" className="field-input pl-8 text-[12.5px]" />
          </div>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="field-input text-[12.5px]">
            <option value="">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} placeholder="Booking ref (EVA-XXXXXX)" className="field-input text-[12.5px]" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field-input text-[12.5px]" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field-input text-[12.5px]" />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--gray)]">
            <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
            Include deleted messages
          </label>
          <button onClick={runSearch} disabled={loading} className="btn-primary btn-sm">{loading ? "Searching…" : "Search"}</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {results.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--gray)]">No messages match these filters.</div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {results.map((m) => (
              <div key={m.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--gray)]">
                  <span className="font-extrabold text-[var(--ink)]">{m.sender.name}</span>
                  <span className="rounded-full bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-bold">{m.sender.role}</span>
                  <span>in</span>
                  <span className="font-bold">{m.conversation.type === "DM" ? "Direct message" : m.conversation.name}</span>
                  <span>·</span>
                  <span>{fmtDate(m.createdAt, { month: "short", day: "numeric" })} {fmtTime(m.createdAt)}</span>
                  {m.editedAt && <span className="rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber">edited</span>}
                  {m.deletedAt && <span className="rounded-full bg-rausch/15 px-1.5 py-0.5 text-[10px] font-bold text-rausch">deleted</span>}
                </div>
                <p className={m.deletedAt ? "mt-1 text-[13px] italic text-[var(--gray)]" : "mt-1 text-[13px]"}>{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
