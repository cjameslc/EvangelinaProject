"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { PlusIcon, EditIcon, TrashIcon, ChevronDownIcon, UserIcon } from "@/components/ui/Icons";
import { ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { useImpersonation } from "@/lib/impersonation";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string };
type UserRow = { id: string; name: string; username: string; role: string; active: boolean; mustChangePassword: boolean; avatarUrl: string | null; avatarColor: string; showOnGuestGuide: boolean; ownedUnits: { unit: Unit }[] };

const EMPTY = { name: "", username: "", password: "", role: "BOOKER", ownedUnitIds: [] as string[], showOnGuestGuide: false };
const PAGE_SIZE = 10;

export function UsersTab({ users, onUsersChange, units }: { users: UserRow[]; onUsersChange: (users: UserRow[]) => void; units: Unit[] }) {
  const toast = useToast();
  const { data: session } = useSession();
  const [modal, setModal] = useState<{ user?: UserRow } | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<UserRow | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);

  const activeUsers = users.filter((u) => u.active);
  const archivedUsers = users.filter((u) => !u.active);

  useEffect(() => setActivePage(1), [activeUsers.length]);
  const activePageCount = Math.max(1, Math.ceil(activeUsers.length / PAGE_SIZE));
  const pagedActiveUsers = activeUsers.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const archivePageCount = Math.max(1, Math.ceil(archivedUsers.length / PAGE_SIZE));
  const pagedArchivedUsers = archivedUsers.slice((archivePage - 1) * PAGE_SIZE, archivePage * PAGE_SIZE);

  async function refresh() {
    const res = await fetch("/api/users");
    if (res.ok) onUsersChange(await res.json());
  }

  async function save(form: typeof EMPTY, id?: string) {
    const body: any = { name: form.name, username: form.username, role: form.role, ownedUnitIds: form.ownedUnitIds, showOnGuestGuide: form.showOnGuestGuide };
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
        {pagedActiveUsers.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt={u.name} className="h-10 w-10 flex-none rounded-full object-cover" />
            ) : (
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-rausch to-[#C13584] text-[13px] font-bold text-white">{initials(u.name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold">{u.name}</span>
                {u.mustChangePassword && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">Must change password</span>
                )}
                {u.showOnGuestGuide && (
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10.5px] font-bold text-teal">👋 On guest guidebook</span>
                )}
              </div>
              <div className="text-[12.5px] text-[var(--gray)]">@{u.username}</div>
              {u.role === "CO_OWNER" && (
                <div className="mt-0.5 text-[11.5px] text-[var(--gray)]">Units: {u.ownedUnits.map((o) => o.unit.shortName).join(", ") || "none assigned"}</div>
              )}
            </div>
            <span className="rounded-full bg-rausch/10 px-2.5 py-1 text-[11.5px] font-bold text-rausch">{ROLE_LABEL[u.role]}</span>
            <div className="flex gap-1">
              {/* Super Admin only, per the admin page's own OWNER_ADMIN gate — never offered for another Owner/Admin or for your own row. */}
              {session?.user?.role === "OWNER_ADMIN" && u.role !== "OWNER_ADMIN" && u.id !== session.user.id && (
                <button onClick={() => setImpersonateTarget(u)} title={`Log in as ${u.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-teal/10 hover:text-teal"><UserIcon className="h-4 w-4" /></button>
              )}
              <button onClick={() => setModal({ user: u })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
              <button onClick={() => archive(u.id)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <Pagination page={activePage} pageCount={activePageCount} onPageChange={setActivePage} totalLabel={`${activeUsers.length} active account${activeUsers.length !== 1 ? "s" : ""}`} />

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
            <>
              <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {pagedArchivedUsers.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-3 p-4 opacity-70">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt={u.name} className="h-10 w-10 flex-none rounded-full object-cover grayscale" />
                    ) : (
                      <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[13px] font-bold text-[var(--gray)]">{initials(u.name)}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold">{u.name}</span>
                        <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--gray)]">Archived</span>
                      </div>
                      <div className="text-[12.5px] text-[var(--gray)]">@{u.username}</div>
                    </div>
                    <span className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--gray)]">{ROLE_LABEL[u.role]}</span>
                    <button onClick={() => restore(u.id)} className="btn-sm btn">Restore</button>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-3">
                <Pagination page={archivePage} pageCount={archivePageCount} onPageChange={setArchivePage} />
              </div>
            </>
          )
        )}
      </div>

      {modal && <UserModal user={modal.user} units={units} onClose={() => setModal(null)} onSave={save} />}
      {impersonateTarget && <ImpersonateModal user={impersonateTarget} onClose={() => setImpersonateTarget(null)} />}
    </div>
  );
}

function ImpersonateModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { startImpersonation, starting } = useImpersonation();
  const toast = useToast();

  async function confirm() {
    const result = await startImpersonation(user.id, reason);
    if (!result.ok) { toast(result.error ?? "Couldn't start impersonation", true); return; }
    // startImpersonation already navigates away on success — nothing left to do here.
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Log in as ${user.name}?`}
      sub="You'll see and act on everything exactly as this account — nothing more."
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={confirm} disabled={starting} className="btn-primary ml-auto">{starting ? "Starting…" : "Start impersonation"}</button></>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 flex-none rounded-full object-cover" />
          ) : (
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-gradient-to-br from-rausch to-[#C13584] text-[13px] font-bold text-white">{initials(user.name)}</span>
          )}
          <div className="min-w-0">
            <div className="text-[14px] font-bold">{user.name}</div>
            <div className="text-[12px] text-[var(--gray)]">@{user.username} · {ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <div>
          <label className="field-label">Reason (optional)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Troubleshooting a booking issue" className="field-input mt-1.5" />
          <p className="mt-1 text-[11.5px] text-[var(--gray)]">Recorded in the impersonation audit log along with this session&rsquo;s start/end time and your IP.</p>
        </div>
        <p className="rounded-xl bg-amber/10 px-3 py-2.5 text-[11.5px] text-amber">
          This session ends automatically after 30 minutes of inactivity, or any time you click &ldquo;Return to My Account.&rdquo; Your own session stays signed in the whole time.
        </p>
      </div>
    </Modal>
  );
}

function UserModal({ user, units, onClose, onSave }: { user?: UserRow; units: Unit[]; onClose: () => void; onSave: (v: typeof EMPTY, id?: string) => void }) {
  const [form, setForm] = useState(
    user
      ? { name: user.name, username: user.username, password: "", role: user.role, ownedUnitIds: user.ownedUnits.map((o) => o.unit.id), showOnGuestGuide: user.showOnGuestGuide }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!user && !form.password) { toast("Password is required for new users", true); return; }
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
          <label className="field-label">Username</label>
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") })}
            className="field-input mt-1.5"
            placeholder="e.g. jsantos"
          />
          <p className="mt-1 text-[11.5px] text-[var(--gray)]">Used to sign in. Lowercase letters, numbers, dots and underscores only.</p>
        </div>
        <div>
          <label className="field-label">{user ? "New password (optional)" : "Password"}</label>
          <input required={!user} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="field-input mt-1.5" placeholder={user ? "Leave blank to keep current" : "min. 6 characters"} />
          <p className="mt-1 text-[11.5px] text-[var(--gray)]">
            {user ? "Setting a new password will require this user to change it on their next sign-in." : "This user will be required to change their password on first sign-in."}
          </p>
        </div>
        <div>
          <label className="field-label">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="field-input mt-1.5">
            {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="rounded-xl border border-[var(--line)] p-3">
          <label className="flex items-center gap-2.5 text-[13.5px] font-semibold">
            <input type="checkbox" checked={form.showOnGuestGuide} onChange={(e) => setForm({ ...form, showOnGuestGuide: e.target.checked })} className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]" />
            Show on the guest Digital Guidebook&rsquo;s &ldquo;Meet our team&rdquo; card
          </label>
          <p className="mt-1 pl-6 text-[11.5px] text-[var(--gray)]">Uses this account&rsquo;s profile photo (set on their Profile page) and name. Off by default — nothing shows to guests until you turn this on.</p>
        </div>
        {form.role === "CO_OWNER" && (
          <div>
            <label className="field-label">Units this co-owner can see</label>
            <div className="mt-1.5 space-y-1.5 rounded-xl border border-[var(--line)] p-2.5">
              {units.map((u) => (
                <label key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] font-semibold hover:bg-[var(--bg-2)]">
                  <input type="checkbox" checked={form.ownedUnitIds.includes(u.id)} onChange={() => toggleUnit(u.id)} className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]" />
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
