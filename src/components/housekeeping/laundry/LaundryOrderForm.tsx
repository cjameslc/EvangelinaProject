"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LAUNDRY_PAYMENT_METHODS, LAUNDRY_PAYMENT_METHOD_LABEL } from "./laundryStatusMeta";
import type { LaundryOrder, LaundryServiceRow } from "./types";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };

/**
 * Deliberately minimal — name, contact number, unit, total price, and how
 * it was paid, matching how staff actually log a laundry drop-off in
 * practice. Everything the fuller data model still tracks under the hood
 * (service, line items, due date) is filled in with a sensible default
 * rather than shown here — see save() below. The richer per-item/status/
 * payment-history detail is still available after creating, from the order
 * detail view.
 */
export function LaundryOrderForm({
  open, onClose, onSaved, order, services, units,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Present when editing an existing order; absent when creating. */
  order?: LaundryOrder | null;
  services: LaundryServiceRow[];
  units: Unit[];
}) {
  const toast = useToast();
  const [customerName, setCustomerName] = useState(order?.customerName ?? "");
  const [contactNumber, setContactNumber] = useState(order?.contactNumber ?? "");
  const [unitId, setUnitId] = useState(order?.unitId ?? "");
  const [totalAmount, setTotalAmount] = useState(order ? String(order.totalAmount) : "");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [amountPaidNow, setAmountPaidNow] = useState(order ? "" : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultService = order ? services.find((s) => s.id === order.serviceId) : services.find((s) => s.active);
  const noServiceConfigured = !order && !defaultService;

  async function save() {
    setError(null);
    if (!customerName.trim()) return setError("Enter the customer's name.");
    if (!contactNumber.trim()) return setError("Enter a contact number.");
    const total = Number(totalAmount);
    if (!total || total <= 0) return setError("Enter the total price.");
    if (noServiceConfigured) return setError("No laundry service is configured yet — add one in the Services tab first.");

    setSaving(true);
    const selectedUnit = units.find((u) => u.id === unitId);

    const payload = order
      ? {
          // Edit: keep this order's own items/service/dates as they were —
          // this simplified form only ever touches the fields it shows.
          customerName: customerName.trim(),
          roomNumber: selectedUnit?.unitNumber ?? order.roomNumber ?? null,
          unitId: unitId || null,
          contactNumber: contactNumber.trim(),
          dateReceived: order.dateReceived,
          dueDate: order.dueDate,
          serviceId: order.serviceId,
          assignedStaffId: order.assignedStaffId,
          items: order.items.map((i) => ({ itemName: i.itemName, category: i.category, quantity: i.quantity, weight: i.weight, color: i.color, condition: i.condition, specialInstructions: i.specialInstructions })),
          discountAmount: order.discountAmount,
          additionalCharges: order.additionalCharges,
          taxAmount: order.taxAmount,
          totalAmountOverride: total,
          notes: order.notes,
        }
      : {
          customerName: customerName.trim(),
          roomNumber: selectedUnit?.unitNumber ?? null,
          unitId: unitId || null,
          contactNumber: contactNumber.trim(),
          dateReceived: new Date().toISOString(),
          dueDate: new Date(Date.now() + (defaultService?.estimatedTurnaroundHours ?? 24) * 3600000).toISOString(),
          serviceId: defaultService!.id,
          items: [{ itemName: "Laundry", category: "General", quantity: 1, weight: null, color: null, condition: null, specialInstructions: null }],
          discountAmount: 0,
          additionalCharges: 0,
          taxAmount: 0,
          totalAmountOverride: total,
          notes: null,
        };

    const res = await fetch(order ? `/api/housekeeping/laundry/orders/${order.id}` : "/api/housekeeping/laundry/orders", {
      method: order ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setSaving(false);
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Couldn't save the order.");
      return;
    }
    const saved = await res.json();

    // New order + an amount was marked paid now — record it in the same step,
    // so "log a laundry order" is genuinely one action, not two.
    const paidNow = Number(amountPaidNow);
    if (!order && paidNow > 0) {
      await fetch(`/api/housekeeping/laundry/orders/${saved.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.min(paidNow, total), method: paymentMethod }),
      }).catch(() => {});
    }

    setSaving(false);
    toast(order ? "Laundry order updated ✓" : "Laundry order logged ✓");
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={order ? `Edit ${order.orderNumber}` : "Log a laundry order"} maxWidth={480}>
      <div className="space-y-4">
        {error && <div className="rounded-xl bg-rausch/10 px-3.5 py-2.5 text-[13px] font-semibold text-rausch">{error}</div>}
        {noServiceConfigured && (
          <div className="rounded-xl bg-amber/10 px-3.5 py-2.5 text-[13px] font-semibold text-amber">No laundry service is configured yet — add one in the Services tab first.</div>
        )}

        <div>
          <label className="field-label">Customer name *</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="field-input mt-1.5" autoFocus />
        </div>
        <div>
          <label className="field-label">Contact number *</label>
          <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="field-input mt-1.5" placeholder="09XX XXX XXXX" />
        </div>
        <div>
          <label className="field-label">Unit</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="field-input mt-1.5">
            <option value="">— Not linked to a unit —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.unitNumber} · {u.shortName}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Total price (₱) *</label>
          <input type="number" min={1} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="field-input mt-1.5" placeholder="0" />
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="field-label">Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input mt-1.5">
              {LAUNDRY_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{LAUNDRY_PAYMENT_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          {!order && (
            <div>
              <label className="field-label">Amount paid now (₱)</label>
              <input type="number" min={0} value={amountPaidNow} onChange={(e) => setAmountPaidNow(e.target.value)} className="field-input mt-1.5" placeholder="0 = not paid yet" />
            </div>
          )}
        </div>
        {!order && (
          <button type="button" onClick={() => setAmountPaidNow(totalAmount)} className="text-[12px] font-bold text-rausch hover:underline">Mark fully paid</button>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-3.5">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving || noServiceConfigured} className="btn-primary">{saving ? "Saving…" : order ? "Save changes" : "Log order"}</button>
        </div>
      </div>
    </Modal>
  );
}
