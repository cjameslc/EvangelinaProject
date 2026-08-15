"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, EditIcon, TrashIcon } from "@/components/ui/Icons";
import { peso, fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

type CouponRow = {
  id: string; code: string; type: string; value: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; active: boolean; description: string | null; createdAt: string;
};

const EMPTY = { code: "", type: "percent" as "percent" | "fixed", value: "", maxUses: "", expiresAt: "", active: true, description: "" };

function isExpired(c: CouponRow): boolean {
  return !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
}
function isExhausted(c: CouponRow): boolean {
  return c.maxUses !== null && c.usedCount >= c.maxUses;
}

/** Guest Portal booking-flow discount codes — admin creates/edits/deactivates
 * here; guests apply a code on the booking details step (see BookFlowView.tsx). */
export function CouponsTab({ coupons, onCouponsChange }: { coupons: CouponRow[]; onCouponsChange: (c: CouponRow[]) => void }) {
  const toast = useToast();
  const [modal, setModal] = useState<{ coupon?: CouponRow } | null>(null);

  async function refresh() {
    const res = await fetch("/api/coupons");
    if (res.ok) onCouponsChange(await res.json());
  }

  async function save(form: typeof EMPTY, id?: string) {
    const body = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
      active: form.active,
      description: form.description || null,
    };
    const res = await fetch(id ? `/api/coupons/${id}` : "/api/coupons", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error ?? "Couldn't save coupon", true); return; }
    toast(id ? "Coupon updated ✓" : "Coupon created ✓");
    setModal(null);
    refresh();
  }

  async function toggleActive(c: CouponRow) {
    const res = await fetch(`/api/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    if (!res.ok) { toast("Couldn't update coupon", true); return; }
    toast(c.active ? "Coupon deactivated" : "Coupon activated ✓");
    refresh();
  }

  async function remove(c: CouponRow) {
    if (!confirm(`Delete coupon "${c.code}"? This can't be undone (existing bookings that used it keep their own record).`)) return;
    const res = await fetch(`/api/coupons/${c.id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't delete coupon", true); return; }
    toast("Coupon deleted");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13.5px] text-[var(--gray)]">{coupons.length} coupon{coupons.length !== 1 ? "s" : ""}. Guests apply these at checkout in the Guest Portal booking flow.</p>
        <button onClick={() => setModal({})} className="btn-primary"><PlusIcon className="h-4 w-4" /> Add coupon</button>
      </div>

      {coupons.length === 0 ? (
        <p className="card p-4 text-[13px] text-[var(--gray)]">No coupons yet.</p>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {coupons.map((c) => {
            const expired = isExpired(c);
            const exhausted = isExhausted(c);
            const inactive = !c.active || expired || exhausted;
            return (
              <div key={c.id} className={`flex flex-wrap items-center gap-3 p-4 ${inactive ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[14px] font-extrabold tracking-wide">{c.code}</span>
                    <span className="rounded-full bg-rausch/10 px-2 py-0.5 text-[11px] font-bold text-rausch">
                      {c.type === "percent" ? `${c.value}% off` : `${peso(c.value)} off`}
                    </span>
                    {!c.active && <span className="rounded-full bg-[var(--bg-2)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--gray)]">Deactivated</span>}
                    {c.active && expired && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">Expired</span>}
                    {c.active && !expired && exhausted && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-600">Limit reached</span>}
                  </div>
                  {c.description && <div className="mt-0.5 text-[12.5px] text-[var(--gray)]">{c.description}</div>}
                  <div className="mt-0.5 text-[11.5px] text-[var(--gray)]">
                    {c.usedCount} used{c.maxUses !== null ? ` / ${c.maxUses} max` : " · unlimited"}
                    {c.expiresAt && ` · expires ${fmtDate(c.expiresAt, { month: "short", day: "numeric", year: "numeric" })}`}
                  </div>
                </div>
                <button onClick={() => toggleActive(c)} className="btn-sm btn">{c.active ? "Deactivate" : "Activate"}</button>
                <div className="flex gap-1">
                  <button onClick={() => setModal({ coupon: c })} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]"><EditIcon className="h-4 w-4" /></button>
                  <button onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch"><TrashIcon className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <CouponModal coupon={modal.coupon} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function CouponModal({ coupon, onClose, onSave }: { coupon?: CouponRow; onClose: () => void; onSave: (v: typeof EMPTY, id?: string) => void }) {
  const [form, setForm] = useState(
    coupon
      ? {
          code: coupon.code, type: coupon.type as "percent" | "fixed", value: String(coupon.value),
          maxUses: coupon.maxUses !== null ? String(coupon.maxUses) : "",
          expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
          active: coupon.active, description: coupon.description ?? "",
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!form.code.trim()) { toast("Enter a coupon code", true); return; }
    const value = Number(form.value);
    if (!Number.isFinite(value) || value <= 0) { toast("Enter a valid discount value", true); return; }
    if (form.type === "percent" && value > 100) { toast("A percent coupon can't exceed 100%", true); return; }
    setSaving(true);
    await onSave(form, coupon?.id);
    setSaving(false);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={coupon ? "Edit coupon" : "Add coupon"}
      sub="Guests enter this code on the booking details step to apply a discount."
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={submit} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save coupon"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Code</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
            className="field-input mt-1.5 font-mono"
            placeholder="e.g. WELCOME10"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Discount type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })} className="field-input mt-1.5">
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>
          <div>
            <label className="field-label">{form.type === "percent" ? "Percent (1-100)" : "Amount (₱)"}</label>
            <input type="number" min={1} max={form.type === "percent" ? 100 : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Max uses (optional)</label>
            <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} className="field-input mt-1.5" placeholder="Unlimited" />
          </div>
          <div>
            <label className="field-label">Expires (optional)</label>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="field-input mt-1.5" />
          </div>
        </div>
        <div>
          <label className="field-label">Note (optional, internal)</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="field-input mt-1.5" placeholder="e.g. Launch promo for repeat guests" />
        </div>
        <label className="flex items-center gap-2.5 text-[13.5px] font-semibold">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]" />
          Active — guests can use this code right away
        </label>
      </div>
    </Modal>
  );
}
