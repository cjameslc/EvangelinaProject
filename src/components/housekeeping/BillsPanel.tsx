"use client";

import { useState } from "react";
import { BILL_TYPES } from "@/lib/constants";
import { peso } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { fileToDataUrl } from "@/lib/file";
import { useToast } from "@/components/ui/Toast";
import { UploadIcon, EditIcon, TrashIcon, PlusIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type Bill = { id: string; unitId: string; unit: Unit; key: string; label: string | null; amountDue: number; amountPaid: number | null; paid: boolean; note: string | null; receiptUrl: string | null; dueDay: number | null };

function billMeta(b: Bill) {
  const found = BILL_TYPES.find((t) => t.key === b.key);
  if (found) return found;
  return { key: "custom", label: b.label ?? "Custom bill", sub: "Added manually", icon: "🧾" };
}

export function BillsPanel({ units, bills, canEdit, onChanged }: { units: Unit[]; bills: Bill[]; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [receiptFor, setReceiptFor] = useState<Bill | null>(null);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [addingFor, setAddingFor] = useState<Unit | null>(null);

  const totalDue = bills.reduce((s, b) => s + (b.paid ? 0 : b.amountDue), 0);
  const totalPaid = bills.reduce((s, b) => s + (b.paid ? b.amountPaid ?? b.amountDue : 0), 0);

  async function togglePaid(bill: Bill) {
    if (!canEdit) return;
    if (!bill.paid) {
      setReceiptFor(bill);
      return;
    }
    await fetch(`/api/housekeeping/bills/${bill.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid: false }) });
    onChanged();
  }

  async function removeBill(bill: Bill) {
    if (!confirm(`Remove "${billMeta(bill).label}"? This can't be undone.`)) return;
    const res = await fetch(`/api/housekeeping/bills/${bill.id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn't remove bill", true); return; }
    toast("Bill removed");
    onChanged();
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-xl font-extrabold text-green">{peso(totalPaid)}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Paid</div></div>
        <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-xl font-extrabold text-rausch">{peso(totalDue)}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Unpaid</div></div>
        <div className="rounded-xl border border-[var(--line)] p-3 col-span-2 sm:col-span-2"><div className="text-xl font-extrabold">{bills.length}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Bills this month</div></div>
      </div>

      {units.map((u) => {
        const unitBills = bills.filter((b) => b.unitId === u.id);
        const allPaid = unitBills.length > 0 && unitBills.every((b) => b.paid);
        return (
          <div key={u.id} className="card mb-3 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
              <span className="rounded-md bg-rausch/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-rausch">unit {u.unitNumber}</span>
              <span className="flex-1 text-[14px] font-extrabold">{u.shortName}</span>
              {unitBills.length > 0 && (
                <span className={cn("text-[12px] font-bold", allPaid ? "text-green" : "text-[var(--gray)]")}>{allPaid ? "All settled" : `${unitBills.filter((b) => !b.paid).length} unpaid`}</span>
              )}
              {canEdit && (
                <button onClick={() => setAddingFor(u)} className="grid h-7 w-7 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]" aria-label="Add a bill">
                  <PlusIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="px-4">
              {unitBills.length === 0 && <p className="py-3 text-[13px] text-[var(--gray)]">No bills yet.</p>}
              {unitBills.map((b) => {
                const meta = billMeta(b);
                return (
                  <div key={b.id} className="flex items-center gap-3 border-t border-[var(--line)] py-3 first:border-0">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--bg-2)] text-lg">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">{meta.label}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--gray)]">
                        <span className="font-extrabold text-green">{peso(b.amountDue)}</span>
                        {b.dueDay && <span>· Due on the {b.dueDay}{b.dueDay === 1 ? "st" : b.dueDay === 2 ? "nd" : b.dueDay === 3 ? "rd" : "th"}</span>}
                        {b.note && <span>· {b.note}</span>}
                      </div>
                    </div>
                    {b.receiptUrl && (
                      <button onClick={() => setReceiptFor(b)} className="btn-sm btn-ghost border border-green/40 !text-green">Receipt ✓</button>
                    )}
                    {canEdit && (
                      <div className="flex flex-none gap-0.5">
                        <button onClick={() => setEditing(b)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]" aria-label="Edit amount"><EditIcon className="h-4 w-4" /></button>
                        {b.key === "custom" && (
                          <button onClick={() => removeBill(b)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch" aria-label="Remove bill"><TrashIcon className="h-4 w-4" /></button>
                        )}
                      </div>
                    )}
                    <label className="relative inline-flex h-[26px] w-[46px] flex-none cursor-pointer items-center">
                      <input type="checkbox" checked={b.paid} onChange={() => togglePaid(b)} disabled={!canEdit} className="peer sr-only" />
                      <span className="absolute inset-0 rounded-full bg-[var(--line-2)] transition-colors peer-checked:bg-green" />
                      <span className="absolute left-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {receiptFor && (
        <ReceiptModal
          bill={receiptFor}
          onClose={() => setReceiptFor(null)}
          onSaved={() => { setReceiptFor(null); onChanged(); toast("Bill updated ✓"); }}
        />
      )}

      {editing && (
        <EditBillModal
          bill={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); toast("Bill updated ✓"); }}
        />
      )}

      {addingFor && (
        <AddBillModal
          unit={addingFor}
          onClose={() => setAddingFor(null)}
          onSaved={() => { setAddingFor(null); onChanged(); toast("Bill added ✓"); }}
        />
      )}
    </div>
  );
}

function EditBillModal({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const meta = billMeta(bill);
  const isCustom = bill.key === "custom";
  const [label, setLabel] = useState(bill.label ?? meta.label);
  const [amountDue, setAmountDue] = useState(bill.amountDue);
  const [dueDay, setDueDay] = useState<number | null>(bill.dueDay);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (amountDue < 0) { toast("Enter a valid amount", true); return; }
    if (isCustom && !label.trim()) { toast("Enter a name for this bill", true); return; }
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) { toast("Due day must be between 1 and 31", true); return; }
    setSaving(true);
    const body: any = { amountDue, dueDay };
    if (isCustom) body.label = label;
    const res = await fetch(`/api/housekeeping/bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { toast("Couldn't save changes", true); return; }
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${meta.label}`}
      sub={bill.unit.shortName}
      maxWidth={380}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save"}</button></>}
    >
      <div className="space-y-4">
        {isCustom && (
          <div>
            <label className="field-label">Bill name</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="field-input mt-1.5" />
          </div>
        )}
        <div>
          <label className="field-label">Amount due (₱)</label>
          <input type="number" value={amountDue} onChange={(e) => setAmountDue(+e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Due day of month (optional)</label>
          <input type="number" min={1} max={31} value={dueDay ?? ""} onChange={(e) => setDueDay(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 15" />
        </div>
      </div>
    </Modal>
  );
}

function AddBillModal({ unit, onClose, onSaved }: { unit: Unit; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [amountDue, setAmountDue] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!label.trim()) { toast("Enter what this bill is for", true); return; }
    if (!amountDue || amountDue <= 0) { toast("Enter an amount", true); return; }
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) { toast("Due day must be between 1 and 31", true); return; }
    setSaving(true);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const res = await fetch("/api/housekeeping/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitId: unit.id, label, amountDue, month, dueDay }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't add bill", true); return; }
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a bill"
      sub={`${unit.shortName} · this month`}
      maxWidth={380}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Add bill"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">What&rsquo;s this for?</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="field-input mt-1.5" placeholder="e.g. Cable TV, Pest control" />
        </div>
        <div>
          <label className="field-label">Amount due (₱)</label>
          <input type="number" value={amountDue ?? ""} onChange={(e) => setAmountDue(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 500" />
        </div>
        <div>
          <label className="field-label">Due day of month (optional)</label>
          <input type="number" min={1} max={31} value={dueDay ?? ""} onChange={(e) => setDueDay(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 15" />
        </div>
      </div>
    </Modal>
  );
}

function ReceiptModal({ bill, onClose, onSaved }: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(bill.amountPaid ?? bill.amountDue);
  const [note, setNote] = useState(bill.note ?? "");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(bill.receiptUrl);
  const [saving, setSaving] = useState(false);
  const meta = billMeta(bill);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("File is too large (max 4MB)."); return; }
    setReceiptUrl(await fileToDataUrl(file));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    handleFile(item.getAsFile() ?? undefined);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/housekeeping/bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: true, amountPaid: amount, note, receiptUrl }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark ${meta.label} paid`}
      sub={bill.unit.shortName}
      maxWidth={420}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Amount paid (₱)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input mt-1.5" placeholder="e.g. OR# 12345" />
        </div>
        <div>
          <label className="field-label">Receipt</label>
          <div
            className="mt-1.5 rounded-2xl border border-dashed border-[var(--line-2)] outline-none focus:border-rausch focus:ring-4 focus:ring-rausch/15"
            tabIndex={0}
            onPaste={handlePaste}
          >
            <input id="receipt-file" type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            {!receiptUrl ? (
              <label htmlFor="receipt-file" className="flex cursor-pointer flex-col items-center gap-2 p-6 text-center text-[13px] font-semibold text-[var(--gray)]">
                <UploadIcon className="h-6 w-6" />
                <span>Tap to upload a photo of the receipt</span>
                <span className="text-[11.5px] font-normal text-[var(--gray)]">or click here and press Ctrl+V to paste a screenshot</span>
              </label>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptUrl} alt="Receipt" className="max-h-40 w-full rounded-2xl object-contain p-2" />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
