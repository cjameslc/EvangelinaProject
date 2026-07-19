"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";

type ChecklistGroup = { name: string; optional?: boolean; items: string[]; unitIds?: string[] };
type UnitLite = { id: string; shortName: string; unitNumber: string };

const EMPTY_GROUP: ChecklistGroup = { name: "", optional: false, items: [""] };

export function ChecklistTab({ initial, units }: { initial: ChecklistGroup[]; units: UnitLite[] }) {
  const toast = useToast();
  const [groups, setGroups] = useState<ChecklistGroup[]>(initial.length ? initial : [EMPTY_GROUP]);
  const [openGroup, setOpenGroup] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);

  function updateGroup(gi: number, patch: Partial<ChecklistGroup>) {
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }
  function toggleGroupUnit(gi: number, unitId: string) {
    setGroups((gs) =>
      gs.map((g, i) => {
        if (i !== gi) return g;
        const current = g.unitIds ?? [];
        const next = current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId];
        return { ...g, unitIds: next };
      })
    );
  }
  function updateItem(gi: number, ii: number, value: string) {
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? value : it)) } : g)));
  }
  function addItem(gi: number) {
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, items: [...g.items, ""] } : g)));
  }
  function removeItem(gi: number, ii: number) {
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g)));
  }
  function addGroup() {
    setGroups((gs) => [...gs, { ...EMPTY_GROUP }]);
    setOpenGroup(groups.length);
  }
  function removeGroup(gi: number) {
    if (!confirm("Remove this checklist group? This does not affect cleanings already in progress, but the room checklist will reflow to the remaining groups.")) return;
    setGroups((gs) => gs.filter((_, i) => i !== gi));
  }

  async function save() {
    const cleaned = groups
      .map((g) => ({ ...g, name: g.name.trim(), items: g.items.map((it) => it.trim()).filter(Boolean) }))
      .filter((g) => g.name && g.items.length > 0);
    if (cleaned.length === 0) {
      toast("Add at least one group with a name and one item.", true);
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistGroups: cleaned }),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save the checklist", true); return; }
    setGroups(cleaned);
    toast("Housekeeping checklist saved ✓");
  }

  return (
    <div>
      <p className="mb-4 text-[13.5px] text-[var(--gray)]">
        This is the checklist housekeeping staff work through for every room. Changes apply to every unit immediately after saving.
      </p>

      <div className="space-y-2.5">
        {groups.map((g, gi) => {
          const open = openGroup === gi;
          return (
            <div key={gi} className="card overflow-hidden">
              <button onClick={() => setOpenGroup(open ? null : gi)} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
                <span className="truncate text-[14px] font-extrabold">{g.name || "Untitled group"}</span>
                {g.optional && <span className="flex-none rounded-full bg-[var(--bg-2)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-[var(--gray)]">optional</span>}
                <span className="ml-auto flex-none text-[12px] font-semibold text-[var(--gray)]">{g.items.filter(Boolean).length} items</span>
                <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
              </button>

              {open && (
                <div className="space-y-3 border-t border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      value={g.name}
                      onChange={(e) => updateGroup(gi, { name: e.target.value })}
                      placeholder="Group name, e.g. Bathroom"
                      className="field-input min-w-[160px] flex-1"
                    />
                    <label className="flex flex-none items-center gap-2 text-[13px] font-semibold">
                      <input type="checkbox" checked={!!g.optional} onChange={(e) => updateGroup(gi, { optional: e.target.checked })} className="h-4 w-4 accent-rausch" />
                      Optional group
                    </label>
                    <button onClick={() => removeGroup(gi)} className="btn-sm btn-ghost !text-rausch">
                      <TrashIcon className="h-3.5 w-3.5" /> Remove group
                    </button>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--gray)]">Applies to</div>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill on={!g.unitIds || g.unitIds.length === 0} onClick={() => updateGroup(gi, { unitIds: undefined })}>All units</Pill>
                      {units.map((u) => (
                        <Pill key={u.id} on={!!g.unitIds?.includes(u.id)} onClick={() => toggleGroupUnit(gi, u.id)}>
                          {u.unitNumber} · {u.shortName}
                        </Pill>
                      ))}
                    </div>
                    {g.unitIds && g.unitIds.length > 0 && (
                      <p className="mt-1.5 text-[11.5px] text-[var(--gray)]">
                        Only shown on the room checklist for {g.unitIds.length} selected unit{g.unitIds.length === 1 ? "" : "s"} — every other unit skips this group.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {g.items.map((item, ii) => (
                      <div key={ii} className="flex items-center gap-2">
                        <input
                          value={item}
                          onChange={(e) => updateItem(gi, ii, e.target.value)}
                          placeholder="Checklist item"
                          className="field-input flex-1"
                        />
                        <button onClick={() => removeItem(gi, ii)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={() => addItem(gi)} className="btn-sm btn">
                    <PlusIcon className="h-3.5 w-3.5" /> Add item
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={addGroup} className="btn">
          <PlusIcon className="h-4 w-4" /> Add group
        </button>
        <button onClick={save} disabled={saving} className="btn-primary ml-auto">
          {saving ? "Saving…" : "Save checklist"}
        </button>
      </div>
    </div>
  );
}
