"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "@/components/ui/Icons";
import { fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { canEditBookings } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; unitNumber: string; shortName: string; owners?: { user: { name: string } }[] };
type Block = { id: string; unitId: string; unit: Unit; type: string; date: string; endDate: string | null; guest: string | null; note: string | null; status: string };

const TYPE_META: Record<string, { label: string; color: string; textColor?: string }> = {
  Full: { label: "21-Hour", color: "#3B71E8" },
  Night: { label: "Night stay", color: "#7C5CE7" },
  Daycation: { label: "Daycation", color: "#0D9E6E" },
  Cleaning: { label: "Cleaning", color: "#8E99AA" },
  Maintenance: { label: "Maintenance", color: "#C87D00" },
};

function fmtDay2(d: Date) {
  return d.toLocaleDateString("en-PH", { weekday: "short" });
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function CalendarView({ role, units, initialBlocks }: { role: string; units: Unit[]; initialBlocks: Block[] }) {
  const toast = useToast();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState<{ mode: "new" | "edit"; block?: Block; unitId?: string; date?: string } | null>(null);
  const canEdit = canEditBookings(role as any);

  const days = useMemo(() => {
    const y = anchor.getFullYear(), m = anchor.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
  }, [anchor]);

  const monthLabel = anchor.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const todayIso = isoDate(new Date());

  function blocksFor(unitId: string, date: Date) {
    const iso = isoDate(date);
    return blocks.filter((b) => b.unitId === unitId && b.date.slice(0, 10) === iso);
  }

  // Daycation / Night-stay counts for this unit within the visible month —
  // shown beside the unit info so each row's mix is visible without scanning.
  const monthTypeCounts = useMemo(() => {
    const dayIsos = new Set(days.map(isoDate));
    const counts = new Map<string, { Daycation: number; Night: number }>();
    for (const b of blocks) {
      if (!dayIsos.has(b.date.slice(0, 10))) continue;
      if (b.type !== "Daycation" && b.type !== "Night") continue;
      const c = counts.get(b.unitId) ?? { Daycation: 0, Night: 0 };
      c[b.type as "Daycation" | "Night"]++;
      counts.set(b.unitId, c);
    }
    return counts;
  }, [blocks, days]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return blocks
      .filter((b) => TYPE_META[b.type] && (b.type === "Full" || b.type === "Night" || b.type === "Daycation") && new Date(b.date) >= new Date(now.toDateString()))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 6);
  }, [blocks]);

  const todayCount = blocks.filter((b) => b.date.slice(0, 10) === todayIso && b.type !== "Cleaning" && b.type !== "Maintenance").length;
  const occupiedUnits = new Set(blocks.filter((b) => b.date.slice(0, 10) === todayIso).map((b) => b.unitId)).size;

  async function refresh() {
    const res = await fetch("/api/calendar");
    if (res.ok) setBlocks(await res.json());
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-9 sm:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Availability Calendar</h1>
          <p className="mt-1 text-[13px] text-[var(--gray)]">{units.length} units · click a day to add a booking</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} className="btn-icon !h-9 !w-9"><ArrowLeftIcon className="h-4 w-4" /></button>
            <span className="min-w-[150px] text-center text-[14.5px] font-extrabold">{monthLabel}</span>
            <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} className="btn-icon !h-9 !w-9"><ArrowRightIcon className="h-4 w-4" /></button>
          </div>
          <button onClick={() => setAnchor(new Date())} className="btn btn-sm">Today</button>
          {canEdit && (
            <button onClick={() => setModal({ mode: "new" })} className="btn-primary">
              <PlusIcon className="h-4 w-4" /> New booking
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-[12px] font-semibold text-[var(--gray)]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Legend</span>
        {Object.entries(TYPE_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />{m.label}</span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: days.length * 52 + 250 }}>
              <div className="flex border-b-2 border-[var(--line)]">
                <div className="sticky left-0 z-10 w-[250px] flex-none border-r border-[var(--line)] bg-[var(--card)] px-4 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Unit</div>
                {days.map((d) => (
                  <div key={+d} className={cn("w-[52px] flex-none border-l border-[var(--line)] py-2 text-center", (d.getDay() === 0 || d.getDay() === 6) && "bg-[var(--bg-2)]", isoDate(d) === todayIso && "border-l-2 border-l-rausch bg-rausch/5")}>
                    <div className="text-[9.5px] font-bold uppercase text-[var(--gray)]">{fmtDay2(d)}</div>
                    <div className={cn("text-[14px] font-extrabold", isoDate(d) === todayIso && "text-rausch")}>{d.getDate()}</div>
                  </div>
                ))}
              </div>

              {units.map((u) => {
                const typeCounts = monthTypeCounts.get(u.id) ?? { Daycation: 0, Night: 0 };
                return (
                <div key={u.id} className="flex border-b border-[var(--line)] last:border-0">
                  <div className="sticky left-0 z-10 flex w-[250px] flex-none items-center gap-2.5 border-r border-[var(--line)] bg-[var(--card)] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="w-fit rounded-md bg-rausch/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-rausch">unit {u.unitNumber}</span>
                      <div className="text-[13px] font-extrabold leading-tight">{u.shortName}</div>
                      <div className="truncate text-[10px] text-[var(--gray)]">Owner: {u.owners?.length ? u.owners.map((o) => o.user.name).join(", ") : "Owner/Admin"}</div>
                    </div>
                    <div className="flex flex-none flex-col gap-1">
                      <span className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-extrabold whitespace-nowrap" style={{ background: `${TYPE_META.Daycation.color}1A`, color: TYPE_META.Daycation.color }}>
                        ☀️ Day {typeCounts.Daycation}
                      </span>
                      <span className="flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-extrabold whitespace-nowrap" style={{ background: `${TYPE_META.Night.color}1A`, color: TYPE_META.Night.color }}>
                        🌙 Night {typeCounts.Night}
                      </span>
                    </div>
                  </div>
                  {days.map((d) => {
                    const items = blocksFor(u.id, d);
                    return (
                      <button
                        key={+d}
                        onClick={() => canEdit && setModal({ mode: "new", unitId: u.id, date: isoDate(d) })}
                        className={cn("flex w-[52px] flex-none flex-col gap-0.5 border-l border-[var(--line)] p-0.5 text-left", (d.getDay() === 0 || d.getDay() === 6) && "bg-[var(--bg-2)]", isoDate(d) === todayIso && "bg-rausch/5")}
                        style={{ minHeight: 56 }}
                      >
                        {items.map((b) => (
                          <span
                            key={b.id}
                            onClick={(e) => { e.stopPropagation(); setModal({ mode: "edit", block: b }); }}
                            className="truncate rounded px-1 py-0.5 text-[9px] font-bold text-white"
                            style={{ background: TYPE_META[b.type]?.color ?? "#999" }}
                            title={b.guest ?? b.type}
                          >
                            {b.guest ?? TYPE_META[b.type]?.label}
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Today at a glance</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 rounded-xl border border-rausch/20 bg-rausch/5 p-3"><div className="text-[22px] font-extrabold text-rausch">{todayCount}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Check-ins today</div></div>
              <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-[22px] font-extrabold">{occupiedUnits}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Occupied now</div></div>
              <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-[22px] font-extrabold">{units.length - occupiedUnits}</div><div className="text-[11px] font-semibold text-[var(--gray)]">Available</div></div>
            </div>
          </div>
          <div className="card p-4">
            <h3 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Upcoming check-ins</h3>
            {upcoming.length === 0 && <p className="text-[12px] text-[var(--gray)]">No upcoming check-ins.</p>}
            {upcoming.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 border-t border-[var(--line)] py-2.5 first:border-0">
                <div className="w-[54px] text-[11px] font-extrabold">{fmtDate(b.date, { month: "short", day: "numeric" })}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold">{b.guest ?? "Guest"}</div>
                  <div className="truncate text-[10.5px] text-[var(--gray)]">{b.unit.shortName} · {TYPE_META[b.type]?.label}</div>
                </div>
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: TYPE_META[b.type]?.color }} />
              </div>
            ))}
          </div>
        </aside>
      </div>

      {modal && (
        <BlockModal
          units={units}
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={() => { refresh(); setModal(null); }}
          toast={toast}
        />
      )}
    </div>
  );
}

function BlockModal({ units, modal, onClose, onSaved, toast }: { units: Unit[]; modal: { mode: "new" | "edit"; block?: Block; unitId?: string; date?: string }; onClose: () => void; onSaved: () => void; toast: (m: string, bad?: boolean) => void }) {
  const b = modal.block;
  const [unitId, setUnitId] = useState(b?.unitId ?? modal.unitId ?? units[0]?.id ?? "");
  const [type, setType] = useState(b?.type ?? "Full");
  const [date, setDate] = useState(b?.date.slice(0, 10) ?? modal.date ?? isoDate(new Date()));
  const [endDate, setEndDate] = useState(b?.endDate?.slice(0, 10) ?? "");
  const [guest, setGuest] = useState(b?.guest ?? "");
  const [saving, setSaving] = useState(false);
  const needsGuest = type === "Full" || type === "Night" || type === "Daycation";
  const needsRange = type === "Maintenance";

  async function save() {
    setSaving(true);
    const payload = { unitId, type, date, endDate: needsRange && endDate ? endDate : null, guest: needsGuest ? guest || "Guest" : null };
    const res = await fetch(modal.mode === "edit" ? `/api/calendar/${b!.id}` : "/api/calendar", {
      method: modal.mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save booking", true); return; }
    toast(modal.mode === "edit" ? "Booking updated ✓" : "Booking added ✓");
    onSaved();
  }

  async function remove() {
    if (!b || !confirm("Delete this booking?")) return;
    const res = await fetch(`/api/calendar/${b.id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete", true); return; }
    toast("Deleted");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={modal.mode === "edit" ? "Edit booking" : "New booking"}
      maxWidth={440}
      footer={
        <>
          {modal.mode === "edit" && <button onClick={remove} className="btn-ghost text-rausch">Delete</button>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save booking"}</button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Unit</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input mt-1.5">
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Type</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {Object.entries(TYPE_META).map(([k, m]) => (
              <Pill key={k} on={type === k} color={m.color} onClick={() => setType(k)}>{m.label}</Pill>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label">{needsGuest ? "Check-in date" : "Date"}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-input mt-1.5" />
        </div>
        {needsRange && (
          <div>
            <label className="field-label">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field-input mt-1.5" />
          </div>
        )}
        {needsGuest && (
          <div>
            <label className="field-label">Guest name</label>
            <input value={guest} onChange={(e) => setGuest(e.target.value)} className="field-input mt-1.5" placeholder="e.g. Santos family" />
          </div>
        )}
      </div>
    </Modal>
  );
}
