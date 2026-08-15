"use client";

import { useState } from "react";
import { BILL_TYPES } from "@/lib/constants";
import { peso, pesoCentavos, billCentavos, billPaidCentavos, formatUnitDisplay } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { EmojiPickerButton } from "@/components/ui/EmojiPickerButton";
import { useToast } from "@/components/ui/Toast";
import { UploadIcon, EditIcon, TrashIcon, PlusIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type Bill = {
  id: string; unitId: string | null; unit: Unit | null; key: string; label: string | null;
  amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null;
  accountNumber?: string | null; paid: boolean; note: string | null; receiptUrl: string | null; dueDay: number | null; recurring: boolean;
};

function billMeta(b: Bill) {
  const found = BILL_TYPES.find((t) => t.key === b.key);
  if (found) return found;
  return { key: "custom", label: b.label ?? "Custom bill", sub: "Added manually", icon: "🧾" };
}

/** A bill amount as centavo-precise ("₱18,300.26") when the bill actually carries cents, otherwise the plain whole-peso format used everywhere else — avoids showing "₱1,799.00" for every ordinary bill. */
function billAmountLabel(centavos: number) {
  return centavos % 100 === 0 ? peso(centavos / 100) : pesoCentavos(centavos);
}

export function BillsPanel({
  units, bills, canEdit, canTogglePaid = canEdit, showMetrics = true, collapsible = false, onChanged,
}: {
  units: Unit[]; bills: Bill[]; canEdit: boolean; canTogglePaid?: boolean; showMetrics?: boolean; collapsible?: boolean; onChanged: () => void;
}) {
  const toast = useToast();
  const [receiptFor, setReceiptFor] = useState<Bill | null>(null);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [addingForUnitId, setAddingForUnitId] = useState<string | null | "__bulk__">(null);
  const [closedUnits, setClosedUnits] = useState<Set<string>>(new Set());

  function toggleUnit(unitId: string) {
    setClosedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId);
      return next;
    });
  }

  const totalDueCentavos = bills.reduce((s, b) => s + (b.paid ? 0 : billCentavos(b)), 0);
  const totalPaidCentavos = bills.reduce((s, b) => s + billPaidCentavos(b), 0);

  async function togglePaid(bill: Bill) {
    if (!canTogglePaid) return;
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
      {showMetrics && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-xl font-extrabold text-green">{billAmountLabel(totalPaidCentavos)}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Paid</div></div>
          <div className="rounded-xl border border-[var(--line)] p-3"><div className="text-xl font-extrabold text-rausch">{billAmountLabel(totalDueCentavos)}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Unpaid</div></div>
          <div className="rounded-xl border border-[var(--line)] p-3 col-span-2 sm:col-span-2"><div className="text-xl font-extrabold">{bills.length}</div><div className="text-[11px] font-bold uppercase text-[var(--gray)]">Bills this month</div></div>
        </div>
      )}

      {canEdit && units.length > 1 && (
        <button onClick={() => setAddingForUnitId("__bulk__")} className="btn btn-sm mb-3">
          <PlusIcon className="h-3.5 w-3.5" /> Add bill to multiple units
        </button>
      )}

      {/* Shared/site-wide bills (no single unit — e.g. the shared Internet
          line) get their own pseudo-group after the real units, so a null
          unitId never gets silently dropped from the list. */}
      {[...units.map((u) => ({ id: u.id, chip: `unit ${u.unitNumber}`, label: formatUnitDisplay(u.unitNumber, u.shortName), realUnit: u as Unit | null })), ...(bills.some((b) => !b.unitId) ? [{ id: "__shared__", chip: "shared", label: "All units", realUnit: null as Unit | null }] : [])].map((g) => {
        const unitBills = bills.filter((b) => (g.realUnit ? b.unitId === g.id : !b.unitId));
        const allPaid = unitBills.length > 0 && unitBills.every((b) => b.paid);
        const open = !collapsible || !closedUnits.has(g.id);
        return (
          <div key={g.id} className="card mb-3 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
              {collapsible ? (
                <button onClick={() => toggleUnit(g.id)} className="flex flex-1 items-center gap-2.5 text-left">
                  <span className="rounded-md bg-rausch/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-rausch">{g.chip}</span>
                  <span className="flex-1 text-[14px] font-extrabold">{g.label}</span>
                  <ChevronDownIcon className={cn("h-4 w-4 flex-none text-[var(--gray)] transition-transform", open && "rotate-180")} />
                </button>
              ) : (
                <>
                  <span className="rounded-md bg-rausch/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-rausch">{g.chip}</span>
                  <span className="flex-1 text-[14px] font-extrabold">{g.label}</span>
                </>
              )}
              {unitBills.length > 0 && (
                <span className={cn("text-[12px] font-bold", allPaid ? "text-green" : "text-[var(--gray)]")}>{allPaid ? "All settled" : `${unitBills.filter((b) => !b.paid).length} unpaid`}</span>
              )}
              {canEdit && g.realUnit && (
                <button onClick={() => setAddingForUnitId(g.realUnit!.id)} className="grid h-7 w-7 flex-none place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]" aria-label="Add a bill">
                  <PlusIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            {open && (
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
                        <span className="font-extrabold text-green">{billAmountLabel(billCentavos(b))}</span>
                        {b.dueDay && <span>· Due on the {b.dueDay}{b.dueDay === 1 ? "st" : b.dueDay === 2 ? "nd" : b.dueDay === 3 ? "rd" : "th"}</span>}
                        {b.recurring && <span>· Recurring monthly</span>}
                        {b.accountNumber && <span>· Acct {b.accountNumber}</span>}
                        {b.note && <span>· {b.note}</span>}
                      </div>
                    </div>
                    {b.receiptUrl && (
                      <button onClick={() => setReceiptFor(b)} className="btn-sm btn-ghost border border-green/40 !text-green">Receipt ✓</button>
                    )}
                    {canEdit && (
                      <div className="flex flex-none gap-0.5">
                        <button onClick={() => setEditing(b)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-[var(--bg-2)] hover:text-[var(--ink)]" aria-label="Edit amount"><EditIcon className="h-4 w-4" /></button>
                        <button onClick={() => removeBill(b)} className="grid h-8 w-8 place-items-center rounded-full text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch" aria-label="Remove bill"><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    )}
                    {canTogglePaid && (
                      <label className="relative inline-flex h-[26px] w-[46px] flex-none cursor-pointer items-center">
                        <input type="checkbox" checked={b.paid} onChange={() => togglePaid(b)} className="peer sr-only" />
                        <span className="absolute inset-0 rounded-full bg-[var(--line-2)] transition-colors peer-checked:bg-green" />
                        <span className="absolute left-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            )}
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

      {addingForUnitId && (
        <AddBillModal
          units={units}
          defaultUnitId={addingForUnitId === "__bulk__" ? undefined : addingForUnitId}
          onClose={() => setAddingForUnitId(null)}
          onSaved={() => { setAddingForUnitId(null); onChanged(); }}
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
  const [recurring, setRecurring] = useState(bill.recurring);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (amountDue < 0) { toast("Enter a valid amount", true); return; }
    if (isCustom && !label.trim()) { toast("Enter a name for this bill", true); return; }
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) { toast("Due day must be between 1 and 31", true); return; }
    setSaving(true);
    const body: any = { amountDue, dueDay };
    if (isCustom) { body.label = label; body.recurring = recurring; }
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
      sub={bill.unit?.shortName ?? "Shared"}
      maxWidth={380}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Save"}</button></>}
    >
      <div className="space-y-4">
        {isCustom && (
          <div>
            <label className="field-label">Bill name</label>
            <div className="mt-1.5 flex gap-2">
              <input value={label} onChange={(e) => setLabel(e.target.value)} className="field-input flex-1" />
              <EmojiPickerButton onSelect={(emoji) => setLabel((v) => v + emoji)} />
            </div>
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
        {isCustom && (
          <label className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-[13.5px] font-semibold">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]" />
            Recurring — automatically add this bill again next month
          </label>
        )}
      </div>
    </Modal>
  );
}

function AddBillModal({ units, defaultUnitId, onClose, onSaved }: { units: Unit[]; defaultUnitId?: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [amountDue, setAmountDue] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<"all" | "select">(defaultUnitId ? "select" : "all");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set(defaultUnitId ? [defaultUnitId] : []));

  const targetUnitIds = scope === "all" ? units.map((u) => u.id) : [...selectedUnitIds];

  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!label.trim()) { toast("Enter what this bill is for", true); return; }
    if (!amountDue || amountDue <= 0) { toast("Enter an amount", true); return; }
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) { toast("Due day must be between 1 and 31", true); return; }
    if (targetUnitIds.length === 0) { toast("Select at least one unit", true); return; }
    setSaving(true);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const results = await Promise.all(
      targetUnitIds.map((unitId) =>
        fetch("/api/housekeeping/bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitId, label, amountDue, month, dueDay, recurring }),
        })
      )
    );
    setSaving(false);
    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) toast(`Added to ${targetUnitIds.length - failed}/${targetUnitIds.length} units — ${failed} failed.`, true);
    else toast(`Bill added to ${targetUnitIds.length} unit${targetUnitIds.length === 1 ? "" : "s"} ✓`);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a bill"
      sub="This month"
      maxWidth={380}
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={save} disabled={saving} className="btn-primary ml-auto">{saving ? "Saving…" : "Add bill"}</button></>}
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">What&rsquo;s this for?</label>
          <div className="mt-1.5 flex gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="field-input flex-1" placeholder="e.g. Cable TV, Pest control" />
            <EmojiPickerButton onSelect={(emoji) => setLabel((v) => v + emoji)} />
          </div>
        </div>
        <div>
          <label className="field-label">Amount due (₱)</label>
          <input type="number" value={amountDue ?? ""} onChange={(e) => setAmountDue(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 500" />
        </div>
        <div>
          <label className="field-label">Due day of month (optional)</label>
          <input type="number" min={1} max={31} value={dueDay ?? ""} onChange={(e) => setDueDay(e.target.value ? +e.target.value : null)} className="field-input mt-1.5" placeholder="e.g. 15" />
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
        <label className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-[13.5px] font-semibold">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]" />
          Recurring — automatically add this bill again next month
        </label>
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
    const body = new FormData();
    body.set("file", file);
    body.set("billId", bill.id);
    const res = await fetch("/api/housekeeping/bills/photo", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { alert(j.error ?? "Couldn't upload the receipt."); return; }
    setReceiptUrl(j.url);
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
      sub={bill.unit?.shortName ?? "Shared"}
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
            className="brand-focus-target mt-1.5 rounded-2xl border border-dashed border-[var(--line-2)] outline-none transition"
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
