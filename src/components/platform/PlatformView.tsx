"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PlusIcon } from "@/components/ui/Icons";

type Owner = {
  id: string;
  businessName: string;
  slug: string;
  status: string;
  primaryColor: string | null;
  logoUrl: string | null;
  // Server-rendered rows come through as Date (Prisma, via props); a
  // freshly created owner appended client-side comes through as a JSON
  // string (fetch response) — not displayed anywhere in this view, so the
  // union is enough rather than normalizing one way or the other.
  createdAt: Date | string;
  _count: { units: number; users: number };
};

const EMPTY_FORM = { businessName: "", ownerName: "", email: "", phone: "", primaryColor: "#6C5CE7" };

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
  const [createdLogin, setCreatedLogin] = useState<{ businessName: string; username: string; tempPassword: string } | null>(null);

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
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast(json.error ?? "Couldn't create owner.", true); return; }
      setOwners((prev) => [...prev, { ...json.owner, _count: { units: 0, users: 1 } }]);
      setCreatedLogin({ businessName: json.owner.businessName, username: json.login.username, tempPassword: json.login.tempPassword });
      setForm(EMPTY_FORM);
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

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[32px]">Evangelina&rsquo;s Staycation Platform</h1>
          <p className="mt-1 text-[15px] text-[var(--gray)]">Every property running on this platform, and its own tenant boundary.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary flex-none">
          <PlusIcon className="h-4 w-4" /> Add Owner
        </button>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {owners.map((o) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 flex-none place-items-center rounded-full text-[15px] font-extrabold text-white"
                style={{ background: o.primaryColor || "#6C5CE7" }}
              >
                {o.businessName.charAt(0).toUpperCase()}
              </span>
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
            <div className="mt-3 flex gap-4 text-[13px] text-[var(--gray)]">
              <span>{o._count.units} unit{o._count.units === 1 ? "" : "s"}</span>
              <span>{o._count.users} staff</span>
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
        </form>
      </Modal>
    </div>
  );
}
