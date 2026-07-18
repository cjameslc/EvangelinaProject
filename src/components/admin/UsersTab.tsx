"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, EditIcon, TrashIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string };
type UserRow = { id: string; name: string; email: string; role: string; active: boolean; ownedUnits: { unit: Unit }[] };

const EMPTY = { name: "", email: "", password: "", role: "BOOKER", ownedUnitIds: [] as string[] };

export function UsersTab({ users, onUsersChange, units }: { users: UserRow[]; onUsersChange: (users: UserRow[]) => void; units: Unit[] }) {
  const toast = useToast();
  const [modal, setModal] = useState<{ user?: UserRow } | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const activeUsers = users.filter((u) => u.active);
  const archivedUsers = users.filter((u) => !u.active);

  async function refresh() {
    const res = await fetch("/api/users");
    if (res.ok) onUsersChange(await res.json());
  }

  async function save(form: typeof EMPTY, id?: string) {
    const body: any = { name: form.name, email: form.email, role: form.role, ownedUnitIds: form.ownedUnitIds };
    if (form.password) body.password = form.password;
    const res = await fetch(id ? `/api/users/${id}` : "/api/users", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't save user", true); return; }
    toast(id ? "User updated ✓" : "User created ✓");
    setModal(null);
    refresh();
  }

  async function archive(id: string) {
    if (!confirm("Archive this user? They will no longer be able to sign in, but can be restored later.")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    toast("User archived");
    refresh();
  }

  async function restore(id: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) { toast("Couldn't restore user", true); return; }
    toast("User restored ✓");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13.5px] text-[var(--gray)]">{activeUsers.length} active account{activeUsers.length !== 1 ? "s" : ""}.</p>
        <button onClick={() => setModal({})} className="btn-primary"><PlusIcon className="h-4 w-4" /> Add user</button>
      </div>

      <div className="card divide-y divide-[var(--line)] overflow-hidden">
        {activeUsers.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-rausch to-[#C13584] text-[13px] font-bold text-white">{initials(u.name)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold">{u.name}</span>
              </div>
              <div className="text-[12.5px] text-[var(--gray)]">{u.email}</div>
              {u.role === "CO_OWNER" && (
                <div className="mt-0.5 text-[11.5px] text-[var(--gray)]">Units: {u.ownedUnits.map((o) => o.unit.shortName).join(", ") || "none assigned"}</div>
              )}
            </div>
            <span className="rounded-full bg-rausch/10 px-2.5 py-1 text-[11.5px] font-bold text-rausch">{ROLE_LABEL[u.role]}</span>
            <div className="flex gap-1">
              <button onClick={() => setModal({ user: u })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
              <button onClick={() => archive(u.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <button onClick={() => setShowArchive((v) => !v)} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
          <h3 className="text-[14px] font-extrabold">Archived accounts</h3>
          <span className="ml-auto text-[12px] font-semibold text-[var(--gray)]">{archivedUsers.length}</span>
          <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", showArchive && "rotate-180")} />
        </button>
        {showArchive && (
          archivedUsers.length === 0 ? (
            <p className="border-t border-[var(--line)] px-4 py-4 text-[13px] text-[var(--gray)]">No archived accounts.</p>
          ) : (
            <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {archivedUsers.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 p-4 opacity-70">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[13px] font-bold text-[var(--gray)]">{initials(u.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold">{u.name}</span>
                      <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--gray)]">Archived</span>
                    </div>
                    <div className="text-[12.5px] text-[var(--gray)]">{u.email}</div>
                  </div>
                  <span className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--gray)]">{ROLE_LABEL[u.role]}</span>
                  <button onClick={() => restore(u.id)} className="btn-sm btn">Restore</button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {modal && <UserModal user={modal.user} units={units} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function UserModal({ user, units, onClose, onSave }: { user?: UserRow; units: Unit[]; onClose: () => void; onSave: (v: typeof EMPTY, id?: string) => void }) {
  const [form, setForm] = useState(
    user
      ? { name: user.name, email: user.email, password: "", role: user.role, ownedUnitIds: user.ownedUnits.map((o) => o.unit.id) }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onSave(form, user?.id);
    setSaving(false);
  }

  function toggleUnit(id: string) {
    setForm((f) => ({ ...f, ownedUnitIds: f.ownedUnitIds.includes(id) ? f.ownedUnitIds.filter((u) => u !== id) : [...f.ownedUnitIds, id] }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? "Edit user" : "Add user"}
      sub="Role controls which pages and units this account can see."
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={submit} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save user"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Full name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">{user ? "New password (optional)" : "Password"}</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field-input mt-1.5" placeholder={user ? "Leave blank to keep current" : "min. 6 characters"} />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="field-input mt-1.5">
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {form.role === "CO_OWNER" && (
          <div>
            <label className="field-label">Units this co-owner can see</label>
            <div className="mt-1.5 space-y-1.5 rounded-xl border border-[var(--line)] p-2.5">
              {units.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] font-semibold hover:bg-[var(--bg-2)]">
                  <input type="checkbox" checked={form.ownedUnitIds.includes(u.id)} onChange={() => toggleUnit(u.id)} className="h-4 w-4 accent-rausch" />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
