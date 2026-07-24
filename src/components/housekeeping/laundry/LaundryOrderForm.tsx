"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PlusIcon, TrashIcon } from "@/components/ui/Icons";
import { peso } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { itemTotals, computeSubtotal, computeOrderTotal } from "@/lib/laundry/laundryPricing";
import type { LaundryOrder, LaundryServiceRow } from "./types";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };
type Employee = { id: string; name: string; role: string };

type ItemDraft = { itemName: string; category: string; quantity: number; weight: string; color: string; condition: string; specialInstructions: string };

const emptyItem = (): ItemDraft => ({ itemName: "", category: "", quantity: 1, weight: "", color: "", condition: "", specialInstructions: "" });

function toDraft(order?: LaundryOrder | null): ItemDraft[] {
  if (!order || order.items.length === 0) return [emptyItem()];
  return order.items.map((i) => ({
    itemName: i.itemName, category: i.category, quantity: i.quantity,
    weight: i.weight != null ? String(i.weight) : "", color: i.color ?? "", condition: i.condition ?? "", specialInstructions: i.specialInstructions ?? "",
  }));
}

export function LaundryOrderForm({
  open, onClose, onSaved, order, services, units, employees,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Present when editing an existing order; absent when creating. */
  order?: LaundryOrder | null;
  services: LaundryServiceRow[];
  units: Unit[];
  employees: Employee[];
}) {
  const toast = useToast();
  const [customerName, setCustomerName] = useState(order?.customerName ?? "");
  const [roomNumber, setRoomNumber] = useState(order?.roomNumber ?? "");
  const [unitId, setUnitId] = useState(order?.unitId ?? "");
  const [contactNumber, setContactNumber] = useState(order?.contactNumber ?? "");
  const [dateReceived, setDateReceived] = useState(order ? order.dateReceived.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(order ? order.dueDate.slice(0, 10) : "");
  const [serviceId, setServiceId] = useState(order?.serviceId ?? services.find((s) => s.active)?.id ?? "");
  const [assignedStaffId, setAssignedStaffId] = useState(order?.assignedStaffId ?? "");
  const [items, setItems] = useState<ItemDraft[]>(toDraft(order));
  const [discountAmount, setDiscountAmount] = useState(String(order?.discountAmount ?? 0));
  const [additionalCharges, setAdditionalCharges] = useState(String(order?.additionalCharges ?? 0));
  const [taxAmount, setTaxAmount] = useState(String(order?.taxAmount ?? 0));
  const [overrideTotal, setOverrideTotal] = useState(false);
  const [totalOverrideValue, setTotalOverrideValue] = useState(order ? String(order.totalAmount) : "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const totals = useMemo(() => itemTotals(items.map((i) => ({ quantity: Number(i.quantity) || 0, weight: i.weight ? Number(i.weight) : null }))), [items]);
  const subtotal = service ? computeSubtotal(totals, service) : 0;
  const computedTotal = computeOrderTotal(subtotal, Number(discountAmount) || 0, Number(additionalCharges) || 0, Number(taxAmount) || 0);
  const finalTotal = overrideTotal && totalOverrideValue ? Number(totalOverrideValue) || 0 : computedTotal;

  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() { setItems((prev) => [...prev, emptyItem()]); }
  function removeItem(idx: number) { setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)); }

  async function save() {
    setError(null);
    if (!customerName.trim()) return setError("Enter the customer's name.");
    if (!contactNumber.trim()) return setError("Enter a contact number.");
    if (!dueDate) return setError("Set a due date.");
    if (!serviceId) return setError("Select a service.");
    for (const it of items) {
      if (!it.itemName.trim() || !it.category.trim()) return setError("Every item needs a name and category.");
    }

    setSaving(true);
    const payload = {
      customerName: customerName.trim(),
      roomNumber: roomNumber.trim() || null,
      unitId: unitId || null,
      contactNumber: contactNumber.trim(),
      dateReceived: new Date(dateReceived).toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      serviceId,
      assignedStaffId: assignedStaffId || null,
      items: items.map((i) => ({
        itemName: i.itemName.trim(), category: i.category.trim(), quantity: Number(i.quantity) || 1,
        weight: i.weight ? Number(i.weight) : null, color: i.color.trim() || null, condition: i.condition.trim() || null,
        specialInstructions: i.specialInstructions.trim() || null,
      })),
      discountAmount: Number(discountAmount) || 0,
      additionalCharges: Number(additionalCharges) || 0,
      taxAmount: Number(taxAmount) || 0,
      totalAmountOverride: overrideTotal ? (Number(totalOverrideValue) || 0) : null,
      notes: notes.trim() || null,
    };

    const res = await fetch(order ? `/api/housekeeping/laundry/orders/${order.id}` : "/api/housekeeping/laundry/orders", {
      method: order ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Couldn't save the order.");
      return;
    }
    toast(order ? "Laundry order updated ✓" : "Laundry order created ✓");
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={order ? `Edit ${order.orderNumber}` : "New laundry order"} maxWidth={720}>
      <div className="space-y-4">
        {error && <div className="rounded-xl bg-rausch/10 px-3.5 py-2.5 text-[13px] font-semibold text-rausch">{error}</div>}

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className="field-label">Customer name *</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Contact number *</label>
            <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="field-input mt-1.5" placeholder="09XX XXX XXXX" />
          </div>
          <div>
            <label className="field-label">Room number</label>
            <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} className="field-input mt-1.5" placeholder="Optional" />
          </div>
          <div>
            <label className="field-label">Unit (optional)</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input mt-1.5">
              <option value="">— Not linked to a unit —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.unitNumber} · {u.shortName}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Date received</label>
            <input type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Due date *</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Service *</label>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="field-input mt-1.5">
              {services.filter((s) => s.active || s.id === serviceId).map((s) => (
                <option key={s.id} value={s.id}>{s.name}{!s.active ? " (inactive)" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Assigned staff</label>
            <select value={assignedStaffId} onChange={(e) => setAssignedStaffId(e.target.value)} className="field-input mt-1.5">
              <option value="">— Unassigned —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="field-label">Items *</label>
            <button type="button" onClick={addItem} className="btn-sm btn"><PlusIcon className="h-3.5 w-3.5" /> Add item</button>
          </div>
          <div className="space-y-2.5">
            {items.map((it, idx) => (
              <div key={idx} className="rounded-xl border border-[var(--line)] p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} placeholder="Item name *" className="field-input col-span-2 sm:col-span-1" />
                  <input value={it.category} onChange={(e) => updateItem(idx, { category: e.target.value })} placeholder="Category *" className="field-input" />
                  <input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} placeholder="Qty" className="field-input" />
                  <input type="number" min={0} step="0.1" value={it.weight} onChange={(e) => updateItem(idx, { weight: e.target.value })} placeholder="Weight (kg)" className="field-input" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input value={it.color} onChange={(e) => updateItem(idx, { color: e.target.value })} placeholder="Color" className="field-input" />
                  <input value={it.condition} onChange={(e) => updateItem(idx, { condition: e.target.value })} placeholder="Condition" className="field-input" />
                  <input value={it.specialInstructions} onChange={(e) => updateItem(idx, { specialInstructions: e.target.value })} placeholder="Special instructions" className="field-input col-span-2 sm:col-span-1" />
                  <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--gray)] hover:bg-rausch/10 hover:text-rausch disabled:opacity-30">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-[var(--gray)]">Total quantity: {totals.totalQuantity} · Total weight: {totals.totalWeight} kg</p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div>
            <label className="field-label">Discount (₱)</label>
            <input type="number" min={0} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Additional charges (₱)</label>
            <input type="number" min={0} value={additionalCharges} onChange={(e) => setAdditionalCharges(e.target.value)} className="field-input mt-1.5" />
          </div>
          <div>
            <label className="field-label">Tax (₱)</label>
            <input type="number" min={0} value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="field-input mt-1.5" />
          </div>
        </div>

        <div className="rounded-xl bg-[var(--bg-2)] p-3.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[var(--gray)]">Subtotal ({service?.pricePerKg ? `${peso(service.pricePerKg)}/kg` : service?.pricePerItem ? `${peso(service.pricePerItem)}/item` : "—"})</span>
            <span className="font-bold">{peso(subtotal)}</span>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold">
            <input type="checkbox" checked={overrideTotal} onChange={(e) => { setOverrideTotal(e.target.checked); if (e.target.checked) setTotalOverrideValue(String(computedTotal)); }} />
            Override total (negotiated/rounded price)
          </label>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[14px] font-extrabold">Total amount</span>
            {overrideTotal ? (
              <input type="number" min={0} value={totalOverrideValue} onChange={(e) => setTotalOverrideValue(e.target.value)} className="field-input !w-32 text-right font-extrabold" />
            ) : (
              <span className="text-[18px] font-extrabold">{peso(finalTotal)}</span>
            )}
          </div>
        </div>

        <div>
          <label className="field-label">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="field-input mt-1.5 min-h-[60px]" />
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-3.5">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : order ? "Save changes" : "Create order"}</button>
        </div>
      </div>
    </Modal>
  );
}
