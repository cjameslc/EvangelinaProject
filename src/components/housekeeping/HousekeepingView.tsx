"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Accordion } from "@/components/ui/Accordion";
import { StatCard } from "@/components/ui/StatCard";
import { fmtDate, fmtTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { canEditHousekeeping } from "@/lib/rbac";
import { RoomCard } from "./RoomCard";
import { StockPanel } from "./StockPanel";
import { BillsPanel } from "./BillsPanel";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type HkState = { id?: string; unitId: string; status: string; byName: string | null; checked: boolean[][]; startedAt?: string | null; endedAt?: string | null };
type Log = { id: string; unitId: string; unit: { shortName: string }; startedAt: string; endedAt: string | null };
type Stock = { id: string; unitId: string; name: string; count: number };
type Bill = any;
type Shift = { id: string; clockIn: string; clockOut: string | null } | null;
type ChecklistGroup = { name: string; optional?: boolean; items: string[] };

export function HousekeepingView({
  role, units, initialStates, initialLogs, initialStocks, employees, initialShift, initialBills, checklistGroups,
}: {
  role: string;
  units: Unit[];
  initialStates: HkState[];
  initialLogs: Log[];
  initialStocks: Stock[];
  employees: { id: string; name: string }[];
  initialShift: Shift;
  initialBills: Bill[];
  checklistGroups: ChecklistGroup[];
}) {
  const { data: session } = useSession();
  const toast = useToast();
  const [states, setStates] = useState(initialStates);
  const [logs, setLogs] = useState(initialLogs);
  const [stocks, setStocks] = useState(initialStocks);
  const [bills, setBills] = useState(initialBills);
  const [shift, setShift] = useState(initialShift);
  const canEdit = canEditHousekeeping(role as any);
  const userName = session?.user?.name ?? "";

  async function refreshHk() {
    const res = await fetch("/api/housekeeping");
    if (res.ok) {
      const j = await res.json();
      setStates(j.states);
      setLogs(j.logs);
    }
  }
  async function refreshStocks() {
    const res = await fetch("/api/housekeeping/stocks");
    if (res.ok) setStocks(await res.json());
  }
  async function refreshBills() {
    const res = await fetch("/api/housekeeping/bills");
    if (res.ok) setBills(await res.json());
  }

  async function updateUnit(unitId: string, patch: any) {
    setStates((prev) => {
      const idx = prev.findIndex((s) => s.unitId === unitId);
      const merged = { ...(prev[idx] ?? { unitId, status: "todo", byName: null, checked: [] }), ...patch };
      if (idx === -1) return [...prev, merged];
      const copy = [...prev];
      copy[idx] = merged;
      return copy;
    });
    await fetch(`/api/housekeeping/unit/${unitId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (patch.status) toast(patch.status === "clean" ? "Room marked clean ✓" : patch.status === "cleaning" ? "Cleaning started" : "Reset to to-do");
    refreshHk();
  }

  async function clockIn() {
    const res = await fetch("/api/housekeeping/shift", { method: "POST" });
    if (res.ok) { setShift(await res.json()); toast("Clocked in ✅"); }
  }
  async function clockOut() {
    const res = await fetch("/api/housekeeping/shift", { method: "PATCH" });
    if (res.ok) { setShift(null); toast("Clocked out"); }
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const cleanedThisWeek = logs.filter((l) => new Date(l.startedAt) >= weekAgo).length;
  const cleanedToday = logs.filter((l) => new Date(l.startedAt).toDateString() === new Date().toDateString()).length;
  const todoCount = units.length - states.filter((s) => s.status === "clean").length;
  const cleaningCount = states.filter((s) => s.status === "cleaning").length;

  const weekChart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d;
    });
    return days.map((d) => ({
      label: d.toLocaleDateString("en-PH", { weekday: "short" }),
      count: logs.filter((l) => new Date(l.startedAt).toDateString() === d.toDateString()).length,
    }));
  }, [logs]);
  const maxCount = Math.max(1, ...weekChart.map((d) => d.count));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Housekeeping</h1>
        <p className="mt-1 text-[14.5px] text-[var(--gray)]">Clock in, work through each room&rsquo;s checklist, keep supplies stocked, and track monthly bills.</p>
      </div>

      <div className="card mb-5 flex flex-wrap items-center gap-3.5 p-4">
        <span className={`h-2.5 w-2.5 rounded-full ${shift ? "bg-green shadow-[0_0_0_4px_rgba(0,138,5,.16)]" : "bg-[var(--gray)]"}`} />
        <div>
          <div className="text-[15px] font-extrabold">{shift ? `${userName} is on duty` : "No one on duty"}</div>
          <div className="text-[13px] text-[var(--gray)]">{shift ? `Clocked in at ${fmtTime(shift.clockIn)}` : "Clock in to start logging your cleaning."}</div>
        </div>
        <div className="ml-auto">
          {canEdit && (shift ? <button onClick={clockOut} className="btn">Clock out</button> : <button onClick={clockIn} className="btn" style={{ background: "#0B7C74", borderColor: "#0B7C74", color: "#fff" }}>Clock in</button>)}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cleaned this week" value={cleanedThisWeek} sub="last 7 days" />
        <StatCard label="Cleaned today" value={cleanedToday} />
        <StatCard label="Rooms to clean" value={todoCount} sub={`${cleaningCount} in progress`} warn={todoCount > 0} />
        <StatCard label="Units" value={units.length} sub="total managed" />
      </div>

      <Accordion title="This week's cleans" sub="turnovers per day">
        <div className="flex h-[120px] items-end gap-2.5 pt-1.5">
          {weekChart.map((d, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative w-full max-w-[42px] rounded-t-lg bg-gradient-to-b from-teal to-[#0EA5A0]" style={{ height: `${Math.max(4, (d.count / maxCount) * 88)}px` }}>
                {d.count > 0 && <span className="absolute -top-5 left-0 right-0 text-center text-[12px] font-extrabold">{d.count}</span>}
              </div>
              <span className="text-[11px] font-bold text-[var(--gray)]">{d.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--line)] pt-3">
          <h3 className="mb-2 text-[13px] font-extrabold">Recent cleaning log</h3>
          {logs.slice(0, 8).map((l) => (
            <div key={l.id} className="flex items-center justify-between border-t border-[var(--line)] py-2.5 text-[13px] first:border-0">
              <span className="font-bold">{l.unit.shortName}</span>
              <span className="text-[var(--gray)]">{fmtDate(l.startedAt)} · {fmtTime(l.startedAt)}{l.endedAt ? `–${fmtTime(l.endedAt)}` : ""}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-[var(--gray)]">No cleaning logged yet.</p>}
        </div>
      </Accordion>

      <Accordion title="Rooms" sub="tap a checklist item to tick it">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {units.map((u) => (
            <RoomCard
              key={u.id}
              unit={u}
              state={states.find((s) => s.unitId === u.id)}
              canEdit={canEdit}
              currentUserName={userName}
              onChange={updateUnit}
              checklistGroups={checklistGroups}
            />
          ))}
        </div>
      </Accordion>

      <Accordion title="Supplies & stocks" sub="set the count per unit">
        <StockPanel units={units} stocks={stocks} canEdit={canEdit} onChanged={refreshStocks} />
      </Accordion>

      <Accordion title="💳 Bills tracker" sub="association dues, utilities & subscriptions">
        <BillsPanel units={units} bills={bills} canEdit={canEdit} onChanged={refreshBills} />
      </Accordion>
    </div>
  );
}
