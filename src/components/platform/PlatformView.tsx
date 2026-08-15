"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PlusIcon, UploadIcon, SettingsIcon, EditIcon, ExternalLinkIcon, TrashIcon } from "@/components/ui/Icons";
import { NAV_ITEMS, ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Owner = {
  id: string;
  businessName: string;
  slug: string;
  status: string;
  primaryColor: string | null;
  logoUrl: string | null;
  // JSON-encoded string[] (a restrictive module tier) or null
  // (unrestricted) — see Owner.enabledModules in prisma/schema.prisma.
  enabledModules: string | null;
  // Server-rendered rows come through as Date (Prisma, via props); a
  // freshly created owner appended client-side comes through as a JSON
  // string (fetch response) — not displayed anywhere in this view, so the
  // union is enough rather than normalizing one way or the other.
  createdAt: Date | string;
  _count: { units: number; users: number };
  adminUsernames: string[];
};

// One row per GET /api/platform/staff — every active staff account across
// every owner, for the "add my employee to another staycation" picker.
type StaffMember = { id: string; name: string; username: string; role: string; ownerId: string | null; owner: { businessName: string } | null };

const DEFAULT_NEW_OWNER_MODULES = ["/dashboard", "/analytics", "/calendar", "/housekeeping", "/admin"];

function parseModules(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const EMPTY_FORM = { businessName: "", ownerName: "", email: "", phone: "", primaryColor: "#6C5CE7", logoUrl: null as string | null };

/**
 * Platform Admin's Owners list + Create Owner flow (multi-owner brief,
 * sections 25/26). Deliberately minimal for this foundational pass — no
 * onboarding wizard, no staff invitations yet (see the route's own doc
 * comment): creating an owner here produces the tenant row plus its first
 * OWNER_ADMIN login, shown once so James can hand it off directly.
 */
export function PlatformView({ owners: initialOwners }: { owners: Owner[] }) {
  const toast = useToast();
  const [owners, setOwners] = useState(initialOwners);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [createdLogin, setCreatedLogin] = useState<{ businessName: string; username: string; tempPassword: string } | null>(null);
  // Create Owner form's starting tier — Unrestricted (null) or a custom
  // checklist, defaulting to the same 5-module starter tier the API falls
  // back to if this is never touched.
  const [newOwnerUnrestricted, setNewOwnerUnrestricted] = useState(false);
  const [newOwnerModules, setNewOwnerModules] = useState<string[]>(DEFAULT_NEW_OWNER_MODULES);

  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [editUnrestricted, setEditUnrestricted] = useState(false);
  const [editModules, setEditModules] = useState<string[]>([]);
  const [savingModules, setSavingModules] = useState(false);

  function openEditModules(owner: Owner) {
    const current = parseModules(owner.enabledModules);
    setEditUnrestricted(current === null);
    setEditModules(current ?? DEFAULT_NEW_OWNER_MODULES);
    setEditingOwner(owner);
  }

  async function saveModules() {
    if (!editingOwner) return;
    setSavingModules(true);
    try {
      const res = await fetch(`/api/platform/owners/${editingOwner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules: editUnrestricted ? null : editModules }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't save modules.", true); return; }
      setOwners((prev) => prev.map((o) => (o.id === editingOwner.id ? { ...o, enabledModules: json.enabledModules } : o)));
      setEditingOwner(null);
      toast("Modules updated ✓");
    } finally {
      setSavingModules(false);
    }
  }

  // "Edit tenant" — a separate modal from "Edit page access" above (which
  // stays focused on just the module checklist): business name, brand
  // color, icon, and ACTIVE/SUSPENDED status. slug is never editable here
  // (see updateOwnerSchema's own comment).
  const [tenantEditOwner, setTenantEditOwner] = useState<Owner | null>(null);
  const [tenantForm, setTenantForm] = useState({ businessName: "", primaryColor: "#6C5CE7", logoUrl: null as string | null, status: "ACTIVE" as "ACTIVE" | "SUSPENDED" });
  const [savingTenant, setSavingTenant] = useState(false);
  const [uploadingTenantLogo, setUploadingTenantLogo] = useState(false);

  function openEditTenant(owner: Owner) {
    setTenantForm({ businessName: owner.businessName, primaryColor: owner.primaryColor || "#6C5CE7", logoUrl: owner.logoUrl, status: owner.status as "ACTIVE" | "SUSPENDED" });
    setTenantEditOwner(owner);
  }

  async function handleTenantLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Icon is too large (max 4MB)", true); return; }
    setUploadingTenantLogo(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/platform/owners/logo", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setTenantForm((f) => ({ ...f, logoUrl: j.url }));
    } catch (e: any) {
      toast(e.message ?? "Couldn't upload icon", true);
    } finally {
      setUploadingTenantLogo(false);
    }
  }

  async function saveTenant() {
    if (!tenantEditOwner) return;
    if (!tenantForm.businessName.trim()) { toast("Business name is required.", true); return; }
    setSavingTenant(true);
    try {
      const res = await fetch(`/api/platform/owners/${tenantEditOwner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tenantForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't save tenant.", true); return; }
      setOwners((prev) => prev.map((o) => (o.id === tenantEditOwner.id ? { ...o, ...json } : o)));
      setTenantEditOwner(null);
      toast("Tenant updated ✓");
    } finally {
      setSavingTenant(false);
    }
  }

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Icon is too large (max 4MB)", true); return; }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/platform/owners/logo", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setForm((f) => ({ ...f, logoUrl: j.url }));
    } catch (e: any) {
      toast(e.message ?? "Couldn't upload icon", true);
    } finally {
      setUploadingLogo(false);
    }
  }

  const totalUnits = owners.reduce((sum, o) => sum + o._count.units, 0);
  const totalStaff = owners.reduce((sum, o) => sum + o._count.users, 0);

  async function createOwner(e: React.FormEvent) {
    e.preventDefault();
    if (!form.businessName.trim() || !form.ownerName.trim() || !form.email.trim()) {
      toast("Business name, owner name, and email are required.", true);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/platform/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, enabledModules: newOwnerUnrestricted ? null : newOwnerModules }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't create owner.", true); return; }
      setOwners((prev) => [...prev, { ...json.owner, _count: { units: 0, users: 1 }, adminUsernames: [json.login.username] }]);
      setCreatedLogin({ businessName: json.owner.businessName, username: json.login.username, tempPassword: json.login.tempPassword });
      setForm(EMPTY_FORM);
      setNewOwnerUnrestricted(false);
      setNewOwnerModules(DEFAULT_NEW_OWNER_MODULES);
      setModalOpen(false);
      // Deliberately no router.refresh() here — the optimistic setOwners
      // update above already keeps the list correct, and refresh() was
      // found (via live testing) to wipe the just-set createdLogin state:
      // re-rendering this client boundary from a fresh server payload mid-
      // update raced the credentials banner right off the screen.
    } finally {
      setSaving(false);
    }
  }

  // "Add my employee to another staycation" — there's no shared-identity
  // concept in this schema (a User row belongs to exactly one owner, same
  // as everywhere else in the app), so this doesn't grant an existing
  // account access to a second tenant. It creates a genuinely new,
  // independent account there, with the picked employee's name as a
  // starting point — same real pattern as manually creating "james-felian"
  // as a separate login from "james", just as a proper flow instead of by
  // hand each time.
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ sourceUserId: "", targetOwnerId: "", name: "", username: "", password: "", role: "BOOKER" });
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [createdStaffLogin, setCreatedStaffLogin] = useState<{ businessName: string; username: string; tempPassword: string } | null>(null);

  // "Grant staycation access" — the additive counterpart to "Add employee"
  // above: the SAME existing login, now also able to switch into a second
  // staycation (see StaycationSwitcher.tsx / OwnerAccess), instead of a
  // brand-new separate account. Shares the same allStaff/loadingStaff
  // picker data "Add employee" already loads.
  const [grantAccessOpen, setGrantAccessOpen] = useState(false);
  const [grantForm, setGrantForm] = useState({ userId: "", targetOwnerId: "", role: "BOOKER" });
  const [savingGrant, setSavingGrant] = useState(false);
  const [grantResult, setGrantResult] = useState<{ userName: string; businessName: string } | null>(null);

  async function loadAllStaff() {
    setLoadingStaff(true);
    try {
      const res = await fetch("/api/platform/staff");
      const json = await res.json().catch(() => []);
      if (res.ok) setAllStaff(json);
      else toast("Couldn't load staff list.", true);
    } finally {
      setLoadingStaff(false);
    }
  }

  function openAddEmployee() {
    setEmployeeForm({ sourceUserId: "", targetOwnerId: "", name: "", username: "", password: "", role: "BOOKER" });
    setAddEmployeeOpen(true);
    loadAllStaff();
  }

  function openGrantAccess() {
    setGrantForm({ userId: "", targetOwnerId: "", role: "BOOKER" });
    setGrantAccessOpen(true);
    loadAllStaff();
  }

  async function saveGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!grantForm.userId) { toast("Pick which existing account to grant access to.", true); return; }
    if (!grantForm.targetOwnerId) { toast("Pick which staycation to grant access to.", true); return; }
    setSavingGrant(true);
    try {
      const res = await fetch("/api/platform/owner-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: grantForm.userId, ownerId: grantForm.targetOwnerId, role: grantForm.role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't grant access.", true); return; }
      setGrantResult({ userName: json.userName, businessName: json.businessName });
      setGrantAccessOpen(false);
    } finally {
      setSavingGrant(false);
    }
  }

  function pickEmployee(id: string) {
    const emp = allStaff.find((s) => s.id === id);
    setEmployeeForm((f) => ({ ...f, sourceUserId: id, name: emp?.name ?? f.name }));
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeForm.targetOwnerId) { toast("Pick which staycation to add them to.", true); return; }
    if (!employeeForm.name.trim() || !employeeForm.username.trim() || !employeeForm.password.trim()) {
      toast("Name, username, and password are required.", true);
      return;
    }
    setSavingEmployee(true);
    try {
      const res = await fetch(`/api/platform/owners/${employeeForm.targetOwnerId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: employeeForm.name, username: employeeForm.username, password: employeeForm.password,
          role: employeeForm.role, sourceUserId: employeeForm.sourceUserId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't add employee.", true); return; }
      const targetOwner = owners.find((o) => o.id === employeeForm.targetOwnerId);
      setOwners((prev) =>
        prev.map((o) =>
          o.id === employeeForm.targetOwnerId
            ? {
                ...o,
                _count: { ...o._count, users: o._count.users + 1 },
                adminUsernames: json.user.role === "OWNER_ADMIN" ? [...o.adminUsernames, json.user.username] : o.adminUsernames,
              }
            : o
        )
      );
      setCreatedStaffLogin({ businessName: targetOwner?.businessName ?? "", username: json.login.username, tempPassword: json.login.tempPassword });
      setAddEmployeeOpen(false);
    } finally {
      setSavingEmployee(false);
    }
  }

  const [deletingOwnerId, setDeletingOwnerId] = useState<string | null>(null);

  // Server-side blocks this for any owner with real units regardless — this
  // check is just so the button reads (and disables) honestly rather than
  // inviting a click that's guaranteed to fail.
  async function deleteOwner(owner: Owner) {
    if (owner._count.units > 0) {
      toast("This staycation has real units — suspend it instead, or remove its units first.", true);
      return;
    }
    if (!confirm(`Delete "${owner.businessName}" (/${owner.slug})? This removes its ${owner._count.users} staff account${owner._count.users === 1 ? "" : "s"} and settings permanently. This can't be undone.`)) return;
    setDeletingOwnerId(owner.id);
    try {
      const res = await fetch(`/api/platform/owners/${owner.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't delete staycation.", true); return; }
      setOwners((prev) => prev.filter((o) => o.id !== owner.id));
      toast(`${owner.businessName} deleted ✓`);
    } finally {
      setDeletingOwnerId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">Evangelina&rsquo;s Staycation Platform</h1>
          <p className="mt-1 text-[15px] text-[var(--gray)]">Every property running on this platform, and its own tenant boundary.</p>
        </div>
        <div className="flex flex-none flex-wrap gap-2">
          <button onClick={openGrantAccess} className="btn flex-none" title="Give an existing login the ability to switch into a second staycation, without creating a new account">
            <PlusIcon className="h-4 w-4" /> Grant Access
          </button>
          <button onClick={openAddEmployee} className="btn flex-none">
            <PlusIcon className="h-4 w-4" /> Add Employee
          </button>
          <button onClick={() => setModalOpen(true)} className="btn-primary flex-none">
            <PlusIcon className="h-4 w-4" /> Add Owner
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-card">
          <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">Owners</div>
          <div className="mt-1.5 text-[24px] font-extrabold tracking-tight">{owners.length}</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">Active Properties</div>
          <div className="mt-1.5 text-[24px] font-extrabold tracking-tight">{owners.filter((o) => o.status === "ACTIVE").length}</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">Total Units</div>
          <div className="mt-1.5 text-[24px] font-extrabold tracking-tight">{totalUnits}</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] font-bold uppercase tracking-wide text-[var(--gray)]">Total Staff</div>
          <div className="mt-1.5 text-[24px] font-extrabold tracking-tight">{totalStaff}</div>
        </div>
      </div>

      {createdLogin && (
        <div className="card mb-6 border-teal/40 bg-teal/5 p-4">
          <div className="text-[14px] font-extrabold text-teal">Owner created ✓ — {createdLogin.businessName}</div>
          <p className="mt-1 text-[13px] text-[var(--gray)]">
            Share this login once — they&rsquo;ll be asked to set their own password on first sign-in.
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-[13.5px] font-semibold">
            <span>Username: <code className="rounded bg-[var(--bg-2)] px-1.5 py-0.5">{createdLogin.username}</code></span>
            <span>Temporary password: <code className="rounded bg-[var(--bg-2)] px-1.5 py-0.5">{createdLogin.tempPassword}</code></span>
          </div>
          <button onClick={() => setCreatedLogin(null)} className="btn btn-sm mt-3">Done</button>
        </div>
      )}

      {createdStaffLogin && (
        <div className="card mb-6 border-teal/40 bg-teal/5 p-4">
          <div className="text-[14px] font-extrabold text-teal">Employee added ✓ — {createdStaffLogin.businessName}</div>
          <p className="mt-1 text-[13px] text-[var(--gray)]">
            Share this login once — they&rsquo;ll be asked to set their own password on first sign-in.
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-[13.5px] font-semibold">
            <span>Username: <code className="rounded bg-[var(--bg-2)] px-1.5 py-0.5">{createdStaffLogin.username}</code></span>
            <span>Temporary password: <code className="rounded bg-[var(--bg-2)] px-1.5 py-0.5">{createdStaffLogin.tempPassword}</code></span>
          </div>
          <button onClick={() => setCreatedStaffLogin(null)} className="btn btn-sm mt-3">Done</button>
        </div>
      )}

      {grantResult && (
        <div className="card mb-6 border-teal/40 bg-teal/5 p-4">
          <div className="text-[14px] font-extrabold text-teal">Access granted ✓</div>
          <p className="mt-1 text-[13px] text-[var(--gray)]">
            {grantResult.userName} can now switch into <strong>{grantResult.businessName}</strong> using their existing login — no new password to share.
          </p>
          <button onClick={() => setGrantResult(null)} className="btn btn-sm mt-3">Done</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {owners.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-center gap-3">
              {o.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logoUrl} alt={o.businessName} className="h-10 w-10 flex-none rounded-full object-cover" />
              ) : (
                <span
                  className="grid h-10 w-10 flex-none place-items-center rounded-full text-[15px] font-extrabold text-white"
                  style={{ background: o.primaryColor || "#6C5CE7" }}
                >
                  {o.businessName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold">{o.businessName}</div>
                <div className="text-[12px] text-[var(--gray)]">/{o.slug}</div>
              </div>
              <span
                className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide ${
                  o.status === "ACTIVE" ? "bg-teal/15 text-teal" : "bg-[var(--bg-2)] text-[var(--gray)]"
                }`}
              >
                {o.status}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--gray)]">
              <span>{o._count.units} unit{o._count.units === 1 ? "" : "s"}</span>
              <span>{o._count.users} staff</span>
              <span className="truncate">
                Admin: {o.adminUsernames.length > 0 ? o.adminUsernames.map((u) => `@${u}`).join(", ") : "none yet"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--line)] pt-3">
              <span className="text-[12px] text-[var(--gray)]">
                {(() => {
                  const modules = parseModules(o.enabledModules);
                  return modules === null ? "Unrestricted access" : `${modules.length} page${modules.length === 1 ? "" : "s"} enabled`;
                })()}
              </span>
              <div className="flex gap-1.5">
                <a href={`/o/${o.slug}/book`} target="_blank" rel="noopener noreferrer" className="btn-icon" aria-label="View live guest site" title="View live guest site">
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
                <button onClick={() => openEditTenant(o)} className="btn-icon" aria-label="Edit tenant" title="Edit tenant">
                  <EditIcon className="h-4 w-4" />
                </button>
                <button onClick={() => openEditModules(o)} className="btn-icon" aria-label="Edit page access" title="Edit page access">
                  <SettingsIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteOwner(o)}
                  disabled={o._count.units > 0 || deletingOwnerId === o.id}
                  className="btn-icon !text-rausch disabled:!text-[var(--gray)] disabled:opacity-50"
                  aria-label="Delete staycation"
                  title={o._count.units > 0 ? "Has real units — suspend instead, or remove its units first" : "Delete staycation"}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Owner"
        sub="Sets up their tenant and first login."
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="btn">Cancel</button>
            <button type="submit" form="create-owner-form" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? "Creating…" : "Create Owner"}
            </button>
          </>
        }
      >
        <form id="create-owner-form" onSubmit={createOwner} className="space-y-4">
          <div>
            <label className="field-label">Business name</label>
            <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className="field-input mt-1.5" placeholder="Maria's Staycation" />
          </div>
          <div>
            <label className="field-label">Owner name</label>
            <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} className="field-input mt-1.5" placeholder="Maria Santos" />
          </div>
          <div>
            <label className="field-label">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Phone (optional)</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Brand color</label>
            <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="mt-1.5 h-10 w-16 rounded-lg border border-[var(--line-2)]" />
          </div>
          <div>
            <label className="field-label">Icon (optional)</label>
            <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Shown in their nav bar. They can change this later from their own Admin settings.</p>
            <div className="mt-1.5 flex items-center gap-3">
              <input id="new-owner-logo" type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
              {form.logoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.logoUrl} alt="Owner icon" className="h-14 w-14 rounded-lg border border-[var(--line)] object-cover" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, logoUrl: null }))} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
                </div>
              ) : (
                <label htmlFor="new-owner-logo" className="grid h-14 w-14 cursor-pointer place-items-center rounded-lg border border-dashed border-[var(--line-2)] text-[var(--gray)]">
                  {uploadingLogo ? <span className="text-[10px] font-bold">…</span> : <UploadIcon className="h-5 w-5" />}
                </label>
              )}
              <label htmlFor="new-owner-logo" className="btn-sm btn cursor-pointer">{uploadingLogo ? "Uploading…" : "Choose image"}</label>
            </div>
          </div>
          <div>
            <label className="field-label">Starting page access</label>
            <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">Which pages their OWNER_ADMIN account (and staff, by role) can reach. Changeable later from this list.</p>
            <label className="mt-2 flex items-center gap-2 text-[13px] font-semibold">
              <input type="checkbox" checked={newOwnerUnrestricted} onChange={(e) => setNewOwnerUnrestricted(e.target.checked)} />
              Unrestricted (full access, same as Evangelina&rsquo;s own account)
            </label>
            {!newOwnerUnrestricted && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-[var(--line)] p-2.5">
                {NAV_ITEMS.map((item) => (
                  <label key={item.href} className="flex items-center gap-1.5 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={newOwnerModules.includes(item.href)}
                      onChange={(e) =>
                        setNewOwnerModules((prev) => (e.target.checked ? [...prev, item.href] : prev.filter((h) => h !== item.href)))
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!tenantEditOwner}
        onClose={() => setTenantEditOwner(null)}
        title="Edit tenant"
        sub={tenantEditOwner ? `/${tenantEditOwner.slug}` : undefined}
        footer={
          <>
            <button type="button" onClick={() => setTenantEditOwner(null)} className="btn">Cancel</button>
            <button type="button" onClick={saveTenant} disabled={savingTenant} className="btn-primary disabled:opacity-50">
              {savingTenant ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="field-label">Business name</label>
            <input value={tenantForm.businessName} onChange={(e) => setTenantForm({ ...tenantForm, businessName: e.target.value })} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Brand color</label>
            <input type="color" value={tenantForm.primaryColor} onChange={(e) => setTenantForm({ ...tenantForm, primaryColor: e.target.value })} className="mt-1.5 h-10 w-16 rounded-lg border border-[var(--line-2)]" />
          </div>
          <div>
            <label className="field-label">Icon</label>
            <div className="mt-1.5 flex items-center gap-3">
              <input id="tenant-edit-logo" type="file" accept="image/*" className="hidden" onChange={(e) => handleTenantLogo(e.target.files?.[0])} />
              {tenantForm.logoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tenantForm.logoUrl} alt="Owner icon" className="h-14 w-14 rounded-lg border border-[var(--line)] object-cover" />
                  <button type="button" onClick={() => setTenantForm((f) => ({ ...f, logoUrl: null }))} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-rausch text-[10px] text-white">✕</button>
                </div>
              ) : (
                <label htmlFor="tenant-edit-logo" className="grid h-14 w-14 cursor-pointer place-items-center rounded-lg border border-dashed border-[var(--line-2)] text-[var(--gray)]">
                  {uploadingTenantLogo ? <span className="text-[10px] font-bold">…</span> : <UploadIcon className="h-5 w-5" />}
                </label>
              )}
              <label htmlFor="tenant-edit-logo" className="btn-sm btn cursor-pointer">{uploadingTenantLogo ? "Uploading…" : "Choose image"}</label>
            </div>
          </div>
          <div>
            <label className="field-label">Status</label>
            <p className="mt-0.5 text-[11.5px] text-[var(--gray)]">A suspended owner&rsquo;s staff can&rsquo;t sign in and its booking page stops accepting new bookings — existing data is never deleted.</p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => setTenantForm({ ...tenantForm, status: "ACTIVE" })}
                className={cn("rounded-full px-3.5 py-2 text-[12.5px] font-bold transition", tenantForm.status === "ACTIVE" ? "bg-teal text-white" : "border border-[var(--line-2)] text-[var(--gray)]")}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setTenantForm({ ...tenantForm, status: "SUSPENDED" })}
                className={cn("rounded-full px-3.5 py-2 text-[12.5px] font-bold transition", tenantForm.status === "SUSPENDED" ? "bg-rausch text-white" : "border border-[var(--line-2)] text-[var(--gray)]")}
              >
                Suspended
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!editingOwner}
        onClose={() => setEditingOwner(null)}
        title="Edit page access"
        sub={editingOwner ? editingOwner.businessName : undefined}
        footer={
          <>
            <button type="button" onClick={() => setEditingOwner(null)} className="btn">Cancel</button>
            <button type="button" onClick={saveModules} disabled={savingModules} className="btn-primary disabled:opacity-50">
              {savingModules ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={editUnrestricted} onChange={(e) => setEditUnrestricted(e.target.checked)} />
            Unrestricted (full access)
          </label>
          {!editUnrestricted && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-[var(--line)] p-2.5">
              {NAV_ITEMS.map((item) => (
                <label key={item.href} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={editModules.includes(item.href)}
                    onChange={(e) =>
                      setEditModules((prev) => (e.target.checked ? [...prev, item.href] : prev.filter((h) => h !== item.href)))
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={addEmployeeOpen}
        onClose={() => setAddEmployeeOpen(false)}
        title="Add employee to another staycation"
        sub="Creates them a new, separate login at the target property — not shared access to their existing one."
        footer={
          <>
            <button type="button" onClick={() => setAddEmployeeOpen(false)} className="btn">Cancel</button>
            <button type="submit" form="add-employee-form" disabled={savingEmployee} className="btn-primary disabled:opacity-50">
              {savingEmployee ? "Adding…" : "Add employee"}
            </button>
          </>
        }
      >
        <form id="add-employee-form" onSubmit={saveEmployee} className="space-y-4">
          <div>
            <label className="field-label">Existing employee (optional — fills in their name)</label>
            <select
              value={employeeForm.sourceUserId}
              onChange={(e) => pickEmployee(e.target.value)}
              disabled={loadingStaff}
              className="field-input mt-1.5"
            >
              <option value="">— Start from scratch —</option>
              {Object.entries(
                allStaff.reduce<Record<string, StaffMember[]>>((groups, s) => {
                  const key = s.owner?.businessName ?? "Unassigned";
                  (groups[key] ??= []).push(s);
                  return groups;
                }, {})
              ).map(([businessName, members]) => (
                <optgroup key={businessName} label={businessName}>
                  {members.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} (@{s.username} · {ROLE_LABEL[s.role] ?? s.role})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Add to staycation</label>
            <select
              value={employeeForm.targetOwnerId}
              onChange={(e) => setEmployeeForm({ ...employeeForm, targetOwnerId: e.target.value })}
              className="field-input mt-1.5"
            >
              <option value="">— Select —</option>
              {/* businessName alone isn't reliably unique (two owners can
                  share a display name — confirmed live: The Felian and a
                  renamed Test Staycation both show as "The Felian") — the
                  slug always is, so it's included here to actually
                  disambiguate, not just decorate. */}
              {owners.map((o) => <option key={o.id} value={o.id}>{o.businessName} (/{o.slug})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Full name</label>
            <input value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} className="field-input mt-1.5" placeholder="Jane Dela Cruz" />
          </div>
          <div>
            <label className="field-label">Username</label>
            <input
              value={employeeForm.username}
              onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") })}
              className="field-input mt-1.5"
              placeholder="e.g. jane.felian"
            />
            <p className="mt-1 text-[11px] text-[var(--gray)]">Used to sign in. Lowercase letters, numbers, dots and underscores only — unique platform-wide, so it usually needs to differ from their existing one.</p>
          </div>
          <div>
            <label className="field-label">Password</label>
            <input type="password" value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} className="field-input mt-1.5" placeholder="min. 6 characters" />
            <p className="mt-1 text-[11px] text-[var(--gray)]">They&rsquo;ll be required to change this on first sign-in.</p>
          </div>
          <div>
            <label className="field-label">Role</label>
            <select value={employeeForm.role} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })} className="field-input mt-1.5">
              {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={grantAccessOpen}
        onClose={() => setGrantAccessOpen(false)}
        title="Grant staycation access"
        sub="Lets an existing login switch into a second staycation — the same account, not a new one. They'll see a switcher appear next time they load the app."
        footer={
          <>
            <button type="button" onClick={() => setGrantAccessOpen(false)} className="btn">Cancel</button>
            <button type="submit" form="grant-access-form" disabled={savingGrant} className="btn-primary disabled:opacity-50">
              {savingGrant ? "Granting…" : "Grant access"}
            </button>
          </>
        }
      >
        <form id="grant-access-form" onSubmit={saveGrant} className="space-y-4">
          <div>
            <label className="field-label">Existing account</label>
            <select
              value={grantForm.userId}
              onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
              disabled={loadingStaff}
              className="field-input mt-1.5"
            >
              <option value="">— Select —</option>
              {Object.entries(
                allStaff.reduce<Record<string, StaffMember[]>>((groups, s) => {
                  const key = s.owner?.businessName ?? "Unassigned";
                  (groups[key] ??= []).push(s);
                  return groups;
                }, {})
              ).map(([businessName, members]) => (
                <optgroup key={businessName} label={businessName}>
                  {members.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} (@{s.username} · {ROLE_LABEL[s.role] ?? s.role})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Grant access to</label>
            <select
              value={grantForm.targetOwnerId}
              onChange={(e) => setGrantForm({ ...grantForm, targetOwnerId: e.target.value })}
              className="field-input mt-1.5"
            >
              <option value="">— Select —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.businessName} (/{o.slug})</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Their role at this staycation</label>
            <select value={grantForm.role} onChange={(e) => setGrantForm({ ...grantForm, role: e.target.value })} className="field-input mt-1.5">
              {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[var(--gray)]">Can differ from their role elsewhere — e.g. Owner/Admin at one property, just a Booker helping out at another.</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
