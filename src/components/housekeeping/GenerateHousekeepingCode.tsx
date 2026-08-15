"use client";

import { useState } from "react";

// Spec sections 6/7 — Owner/Booker only (enforced again server-side by
// canGrantHousekeepingAccess; this component is only ever rendered for
// those roles in the first place, see RoomCard's canGrantAccess prop).
export function GenerateHousekeepingCode({ unitId, housekeepers }: { unitId: string; housekeepers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(housekeepers[0]?.id ?? "");
  const [state, setState] = useState<{ loading: boolean; error: string | null; code: string | null }>({ loading: false, error: null, code: null });

  async function generate() {
    setState({ loading: true, error: null, code: null });
    try {
      const res = await fetch("/api/access/credential/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, employeeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate code.");
      setState({ loading: false, error: null, code: data.code });
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Failed to generate code.", code: null });
    }
  }

  if (housekeepers.length === 0) return null;

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-[11.5px] font-bold text-rausch hover:underline">+ Generate temporary code</button>;
  }

  return (
    <div className="rounded-xl border border-[var(--line)] p-2.5">
      {state.code ? (
        <div className="text-[12.5px]">
          <span className="font-bold text-[var(--ink)]">Code sent: </span><span className="font-mono">{state.code}</span>
          <button onClick={() => { setOpen(false); setState({ loading: false, error: null, code: null }); }} className="ml-2 text-[11.5px] font-bold text-[var(--gray)] hover:underline">Done</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="field-input flex-1 !py-1.5 text-[12.5px]">
            {housekeepers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button onClick={generate} disabled={state.loading} className="btn-sm btn-primary">{state.loading ? "…" : "Generate"}</button>
          <button onClick={() => setOpen(false)} className="btn-sm btn-ghost">Cancel</button>
        </div>
      )}
      {state.error && <p className="mt-1.5 text-[11.5px] font-semibold text-rausch">{state.error}</p>}
    </div>
  );
}
