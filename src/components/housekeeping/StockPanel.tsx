"use client";

import { useState } from "react";
import { TrashIcon, PlusIcon } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

type Unit = { id: string; name: string; shortName: string };
type Stock = { id: string; unitId: string; name: string; count: number };

export function StockPanel({ units, stocks, canEdit, onChanged }: { units: Unit[]; stocks: Stock[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [openUnit, setOpenUnit] = useState<string | null>(units[0]?.id ?? null);
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [bulkAdding, setBulkAdding] = useState(false);

  async function setCount(id: string, count: number) {
    await fetch(`/api/housekeeping/stocks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: Math.max(0, count) }) });
    onChanged();
  }
  async function removeItem(id: string) {
    await fetch(`/api/housekeeping/stocks/${id}`, { method: "DELETE" });
    onChanged();
  }
  async function addItem(unitId: string) {
    const name = (newItem[unitId] ?? "").trim();
    if (!name) return;
    await fetch("/api/housekeeping/stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId, name, count: 1 }) });
    setNewItem((s) => ({ ...s, [unitId]: "" }));
    onChanged();
    toast("Item added ✓");
  }

  return (
    <div className="space-y-3">
      {canEdit && units.length > 1 && (
        <button onClick={() => setBulkAdding(true)} className="btn btn-sm">
          <PlusIcon className="h-3.5 w-3.5" /> Add supply to multiple units
        </button>
      )}
      {bulkAdding && (
        <BulkAddStockModal
          units={units}
          onClose={() => setBulkAdding(false)}
          onSaved={() => { setBulkAdding(false); onChanged(); }}
        />
      )}
      {units.map((u) => {
        const items = stocks.filter((s) => s.unitId === u.id);
        const lowCount = items.filter((s) => s.count <= 2).length;
        const open = openUnit === u.id;
        return (
          <div key={u.id} className="card overflow-hidden">
            <button onClick={() => setOpenUnit(open ? null : u.id)} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
              <h3 className="text-[14px] font-extrabold">{u.shortName}</h3>
              {lowCount > 0 && <span className="ml-auto text-[12px] font-bold text-amber">{lowCount} low</span>}
            </button>
            {open && (
              <div className="space-y-0 px-4 pb-4">
                {items.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 border-t border-[var(--line)] py-2.5 first:border-0">
                    <span className="flex-1 text-[14px] font-semibold">{s.name}</span>
                    {s.count === 0 ? (
                      <span className="rounded-full bg-rausch/15 px-2 py-0.5 text-[11px] font-extrabold text-rausch">Out</span>
                    ) : s.count <= 2 ? (
                      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-extrabold text-amber">Low</span>
                    ) : null}
                    <div className="inline-flex items-center overflow-hidden rounded-lg border border-[var(--line-2)]">
                      <button disabled={!canEdit} onClick={() => setCount(s.id, s.count - 1)} className="h-9 w-8 text-lg font-bold hover:bg-[var(--bg-2)] disabled:opacity-40">−</button>
                      <span className="grid h-9 w-11 place-items-center border-x border-[var(--line-2)] text-[14px] font-extrabold">{s.count}</span>
                      <button disabled={!canEdit} onClick={() => setCount(s.id, s.count + 1)} className="h-9 w-8 text-lg font-bold hover:bg-[var(--bg-2)] disabled:opacity-40">+</button>
                    </div>
                    {canEdit && (
                      <button onClick={() => removeItem(s.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div className="mt-2 flex gap-2">
                    <input value={newItem[u.id] ?? ""} onChange={(e) => setNewItem((s) => ({ ...s, [u.id]: e.target.value }))} placeholder="Add a supply item…" className="field-input flex-1" onKeyDown={(e) => e.key === "Enter" && addItem(u.id)} />
                    <button onClick={() => addItem(u.id)} className="btn-icon"><PlusIcon className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BulkAddStockModal({ units, onClose, onSaved }: { units: Unit[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"all" | "select">("all");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const targetUnitIds = scope === "all" ? units.map((u) => u.id) : [...selectedUnitIds];

  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!name.trim()) { toast("Enter what this item is", true); return; }
    if (targetUnitIds.length === 0) { toast("Select at least one unit", true); return; }
    setSaving(true);
    const results = await Promise.all(
      targetUnitIds.map((unitId) =>
        fetch("/api/housekeeping/stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId, name: name.trim(), count: 1 }) })
      )
    );
    setSaving(false);
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) toast(`Added to ${targetUnitIds.length - failed}/${targetUnitIds.length} units — ${failed} failed.`, true);
    else toast(`Added to ${targetUnitIds.length} unit${targetUnitIds.length === 1 ? "" : "s"} ✓`);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add supply item"
      sub="Choose which units get this item"
      maxWidth={420}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Adding…" : "Add item"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Item name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field-input mt-1.5" placeholder="e.g. Tissue rolls" />
        </div>
        <div>
          <label className="field-label">Apply to</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill on={scope === "all"} onClick={() => setScope("all")}>All units</Pill>
            <Pill on={scope === "select"} onClick={() => setScope("select")}>Select units</Pill>
          </div>
          {scope === "select" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {units.map((u) => (
                <Pill key={u.id} on={selectedUnitIds.has(u.id)} onClick={() => toggleUnit(u.id)}>{u.shortName}</Pill>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
