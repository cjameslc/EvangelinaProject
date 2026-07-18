"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, TrashIcon } from "@/components/ui/Icons";
import { ROLE_LABEL } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";

type Employee = { id: string; name: string; role: string; payRateNote?: string | null };

export function TeamModal({ open, onClose, employees, onChanged }: { open: boolean; onClose: () => void; employees: Employee[]; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<{ id?: string; name: string; role: string }[]>(
    employees.length ? employees.map((e) => ({ id: e.id, name: e.name, role: e.role })) : [{ name: "", role: "BOOKER" }]
  );
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<{ name: string; role: string }>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      for (const row of rows) {
        if (!row.name.trim()) continue;
        if (row.id) {
          await fetch(`/api/employees/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: row.name, role: row.role }) });
        } else {
          await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: row.name, role: row.role }) });
        }
      }
      toast("Team saved ✓");
      onChanged();
      onClose();
    } catch {
      toast("Couldn't save team", true);
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number) {
    const row = rows[i];
    if (row.id) await fetch(`/api/employees/${row.id}`, { method: "DELETE" });
    setRows((r) => r.filter((_, idx) => idx !== i));
    onChanged();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage team"
      sub="Add or edit staff. These names fill the Booker, Cleaner and Received-by menus."
      footer={
        <>
          <button onClick={() => setRows((r) => [...r, { name: "", role: "BOOKER" }])} className="btn-sm btn">
            <PlusIcon className="h-4 w-4" /> Add person
          </button>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save team"}</button>
          </div>
        </>
      }
    >
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.id ?? i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Full name" className="field-input min-w-[140px] flex-1" />
            <select value={row.role} onChange={(e) => update(i, { role: e.target.value })} className="field-input flex-1 sm:w-[160px] sm:flex-none">
              {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button onClick={() => remove(i)} className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-[var(--line-2)] text-[var(--gray)] hover:border-rausch hover:text-rausch">
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
