"use client";

import { useEffect, useMemo, useState } from "react";
import { FAQ_CATEGORIES, FAQ_ENTRIES, UNIT_REFERENCE_NOTE, type FaqEntry } from "@/lib/socialFaq";
import { formatUnitDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyIcon, SparkleIcon, ChevronDownIcon } from "@/components/ui/Icons";

type Unit = { id: string; unitNumber: string; shortName: string; wifiSsid: string | null; wifiPassword: string | null; doorCode: string | null };

const FAVORITES_KEY = "social-faq-favorites";
const RECENT_KEY = "social-faq-recent";

function loadIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function saveIds(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids));
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) => (p.toLowerCase() === query.toLowerCase() ? <mark key={i} className="rounded bg-amber/30 px-0.5">{p}</mark> : p));
}

export function CheatSheetTab({ units, toast }: { units: Unit[]; toast: (msg: string, isError?: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [rephrasing, setRephrasing] = useState<{ id: string; mode: "translate" | "friendly" } | null>(null);
  const [rephraseResults, setRephraseResults] = useState<Record<string, string>>({});

  useEffect(() => {
    setFavorites(loadIds(FAVORITES_KEY));
    setRecent(loadIds(RECENT_KEY));
  }, []);

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveIds(FAVORITES_KEY, next);
      return next;
    });
  }

  function markRecent(id: string) {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 5);
      saveIds(RECENT_KEY, next);
      return next;
    });
  }

  function copy(text: string, label: string, id: string) {
    navigator.clipboard.writeText(text).then(
      () => { toast(`Copied — ${label} ✓`); markRecent(id); },
      () => toast("Couldn't copy — select and copy manually.", true)
    );
  }

  async function rephrase(entry: FaqEntry, mode: "translate" | "friendly") {
    setRephrasing({ id: entry.id, mode });
    try {
      const res = await fetch("/api/social/faq-rephrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: entry.answer, mode }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't rephrase.");
      setRephraseResults((prev) => ({ ...prev, [`${entry.id}:${mode}`]: j.result }));
    } catch (e: any) {
      toast(e.message ?? "Couldn't rephrase right now.", true);
    } finally {
      setRephrasing(null);
    }
  }

  const filtered = useMemo(() => {
    return FAQ_ENTRIES.filter((e) => {
      if (category === "favorites") return favorites.includes(e.id);
      if (category !== "all" && e.categoryId !== category) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.question} ${e.answer} ${e.keywords.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [category, search, favorites]);

  const recentEntries = recent.map((id) => FAQ_ENTRIES.find((e) => e.id === id)).filter((e): e is FaqEntry => !!e);

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-extrabold">Unit Reference</h2>
        <p className="mb-3 text-[12.5px] text-[var(--gray)]">{UNIT_REFERENCE_NOTE}</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {units.map((u) => (
            <div key={u.id} className="rounded-xl border border-[var(--line)] p-3">
              <p className="mb-1.5 text-[13px] font-extrabold">{formatUnitDisplay(u.unitNumber, u.shortName)}</p>
              <div className="space-y-1 text-[12px]">
                {u.doorCode && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--gray)]">Door code: <span className="font-mono font-bold text-[var(--ink)]">{u.doorCode}</span></span>
                    <button onClick={() => copy(u.doorCode!, "door code", `unit-${u.id}`)} className="text-[var(--gray)] hover:text-[var(--ink)]"><CopyIcon className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {u.wifiSsid && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--gray)]">WiFi: <span className="font-bold text-[var(--ink)]">{u.wifiSsid}</span> / <span className="font-mono font-bold text-[var(--ink)]">{u.wifiPassword}</span></span>
                    <button onClick={() => copy(`${u.wifiSsid} / ${u.wifiPassword}`, "WiFi details", `unit-wifi-${u.id}`)} className="text-[var(--gray)] hover:text-[var(--ink)]"><CopyIcon className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {recentEntries.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-extrabold text-[var(--gray)]">Recently used</h3>
          <div className="flex flex-wrap gap-1.5">
            {recentEntries.map((e) => (
              <button key={e.id} onClick={() => { setOpenId(e.id); setCategory("all"); setSearch(""); }} className="pill">{e.question.slice(0, 30)}{e.question.length > 30 ? "…" : ""}</button>
            ))}
          </div>
        </div>
      )}

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search question…" className="field-input" />

      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setCategory("all")} className={cn("pill", category === "all" && "on")}>All ({FAQ_ENTRIES.length})</button>
        <button onClick={() => setCategory("favorites")} className={cn("pill", category === "favorites" && "on")}>⭐ Favorites ({favorites.length})</button>
        {FAQ_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={cn("pill", category === c.id && "on")}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((entry) => {
          const open = openId === entry.id;
          const isFav = favorites.includes(entry.id);
          return (
            <div key={entry.id} className="card overflow-hidden">
              <div className="flex items-center">
                <button onClick={() => toggleFavorite(entry.id)} className={cn("flex-none py-4 pl-4 text-[15px]", isFav ? "" : "opacity-30 hover:opacity-70")} title="Favorite">⭐</button>
                <button onClick={() => setOpenId(open ? null : entry.id)} className="flex flex-1 items-center justify-between gap-2 py-4 pl-2 pr-4 text-left">
                  <span className="truncate font-bold">❓ {highlight(entry.question, search)}</span>
                  <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                </button>
              </div>
              {open && (
                <div className="border-t border-[var(--line)] p-4">
                  <p className="whitespace-pre-line text-[13.5px]">{highlight(entry.answer, search)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => copy(entry.answer, "answer", entry.id)} className="btn-sm btn"><CopyIcon className="h-3.5 w-3.5" /> Copy Answer</button>
                    <button onClick={() => copy(entry.short, "short version", entry.id)} className="btn-sm btn-ghost"><CopyIcon className="h-3.5 w-3.5" /> Copy Short Version</button>
                    <button
                      onClick={() => rephrase(entry, "translate")}
                      disabled={rephrasing?.id === entry.id && rephrasing.mode === "translate"}
                      className="btn-sm btn-ghost disabled:opacity-60"
                    >
                      <SparkleIcon className="h-3.5 w-3.5" /> {rephrasing?.id === entry.id && rephrasing.mode === "translate" ? "Translating…" : "Translate to English"}
                    </button>
                    <button
                      onClick={() => rephrase(entry, "friendly")}
                      disabled={rephrasing?.id === entry.id && rephrasing.mode === "friendly"}
                      className="btn-sm btn-ghost disabled:opacity-60"
                    >
                      <SparkleIcon className="h-3.5 w-3.5" /> {rephrasing?.id === entry.id && rephrasing.mode === "friendly" ? "Rewriting…" : "❤️ Friendlier version"}
                    </button>
                  </div>
                  {rephraseResults[`${entry.id}:translate`] && (
                    <div className="mt-3 rounded-xl border border-violet/25 bg-violet/5 p-3">
                      <p className="whitespace-pre-line text-[13px]">{rephraseResults[`${entry.id}:translate`]}</p>
                      <button onClick={() => copy(rephraseResults[`${entry.id}:translate`], "English version", entry.id)} className="btn-sm btn mt-2"><CopyIcon className="h-3.5 w-3.5" /> Copy</button>
                    </div>
                  )}
                  {rephraseResults[`${entry.id}:friendly`] && (
                    <div className="mt-3 rounded-xl border border-violet/25 bg-violet/5 p-3">
                      <p className="whitespace-pre-line text-[13px]">{rephraseResults[`${entry.id}:friendly`]}</p>
                      <button onClick={() => copy(rephraseResults[`${entry.id}:friendly`], "friendlier version", entry.id)} className="btn-sm btn mt-2"><CopyIcon className="h-3.5 w-3.5" /> Copy</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-[13px] text-[var(--gray)]">No FAQs match — try a different search or category.</p>}
      </div>
    </div>
  );
}
