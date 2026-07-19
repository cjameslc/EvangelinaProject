"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { ROLE_LABEL } from "@/lib/constants";
import { fmtDate, fmtTime, initials } from "@/lib/format";
import { SearchIcon } from "@/components/ui/Icons";

type LoginLog = {
  id: string;
  createdAt: string;
  actor: { id: string; name: string; username: string; role: string } | null;
};

const PAGE_SIZE = 20;

export function LoginLogsTab({ logs }: { logs: LoginLog[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) => (l.actor?.name.toLowerCase().includes(q) || l.actor?.username.toLowerCase().includes(q)));
  }, [logs, search]);

  useEffect(() => setPage(1), [search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const uniqueAccounts = new Set(logs.filter((l) => l.actor).map((l) => l.actor!.id)).size;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <p className="text-[13.5px] text-[var(--gray)]">{logs.length} sign-ins logged · {uniqueAccounts} account{uniqueAccounts !== 1 ? "s" : ""}.</p>
        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gray)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or username" className="field-input pl-10" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No sign-ins yet" sub="Once someone logs in, it'll show up here." />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {paged.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-rausch to-[#C13584] text-[12px] font-bold text-white">
                  {l.actor ? initials(l.actor.name) : "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold">{l.actor?.name ?? "Deleted account"}</div>
                  <div className="truncate text-[12px] text-[var(--gray)]">{l.actor ? `@${l.actor.username}` : "—"}</div>
                </div>
                {l.actor && (
                  <span className="flex-none rounded-full bg-rausch/10 px-2.5 py-1 text-[11px] font-bold text-rausch">{ROLE_LABEL[l.actor.role] ?? l.actor.role}</span>
                )}
                <div className="flex-none text-right text-[12px] text-[var(--gray)]">
                  <div className="font-semibold text-[var(--ink)]">{fmtDate(l.createdAt, { month: "short", day: "numeric", year: "numeric" })}</div>
                  <div>{fmtTime(l.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalLabel={`${filtered.length} sign-in${filtered.length !== 1 ? "s" : ""}`} />
    </div>
  );
}
