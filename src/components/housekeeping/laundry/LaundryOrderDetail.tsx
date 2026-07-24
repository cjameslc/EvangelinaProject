"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { peso, fmtDate, fmtTime } from "@/lib/format";
import { LAUNDRY_STATUSES, LAUNDRY_STATUS_COLOR, LAUNDRY_NEXT_STATUS, LAUNDRY_PAYMENT_METHOD_LABEL, LAUNDRY_PAYMENT_METHODS } from "./laundryStatusMeta";
import type { LaundryOrderDetail as LaundryOrderDetailType } from "./types";

export function LaundryOrderDetail({
  open, onClose, order, canEdit, canPay, onChanged, onEdit,
}: {
  open: boolean;
  onClose: () => void;
  order: LaundryOrderDetailType | null;
  canEdit: boolean;
  canPay: boolean;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [statusNotes, setStatusNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (!order) return null;
  const nextStatus = LAUNDRY_NEXT_STATUS[order.status];

  async function setStatus(status: string) {
    setBusy(true);
    const res = await fetch(`/api/housekeeping/laundry/orders/${order!.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes: statusNotes.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => null); toast(j?.error ?? "Couldn't update status", true); return; }
    setStatusNotes("");
    toast(`Marked ${status} ✓`);
    onChanged();
  }

  async function addPayment() {
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) { toast("Enter a valid payment amount", true); return; }
    setBusy(true);
    const res = await fetch(`/api/housekeeping/laundry/orders/${order!.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, method: paymentMethod }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => null); toast(j?.error ?? "Couldn't record payment", true); return; }
    setPaymentAmount("");
    toast("Payment recorded ✓");
    onChanged();
  }

  async function cancelOrder() {
    if (!cancelReason.trim()) { toast("A cancellation reason is required", true); return; }
    setBusy(true);
    const res = await fetch(`/api/housekeeping/laundry/orders/${order!.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: cancelReason.trim() }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => null); toast(j?.error ?? "Couldn't cancel order", true); return; }
    toast("Order cancelled");
    setShowCancelForm(false);
    onChanged();
  }

  async function printReceipt() {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Evangelina's Staycation", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(110);
    doc.text(`Laundry Receipt — ${order!.orderNumber}`, 14, 25);
    doc.setTextColor(0);
    autoTable(doc, {
      theme: "plain", startY: 34,
      headStyles: { fillColor: [255, 56, 92], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 10, cellPadding: 3 },
      head: [["Detail", "Value"]],
      body: [
        ["Customer", order!.customerName],
        ["Room", order!.roomNumber ?? "—"],
        ["Contact", order!.contactNumber],
        ["Date received", fmtDate(order!.dateReceived, { month: "short", day: "numeric", year: "numeric" })],
        ["Due date", fmtDate(order!.dueDate, { month: "short", day: "numeric", year: "numeric" })],
        ["Service", order!.service.name],
        ["Items", String(order!.totalQuantity)],
        ["Total weight", `${order!.totalWeight} kg`],
        ["Subtotal", peso(order!.subtotal)],
        ...(order!.discountAmount ? [["Discount", `-${peso(order!.discountAmount)}`]] : []),
        ...(order!.additionalCharges ? [["Additional charges", peso(order!.additionalCharges)]] : []),
        ...(order!.taxAmount ? [["Tax", peso(order!.taxAmount)]] : []),
        ["Total amount", peso(order!.totalAmount)],
        ["Amount paid", peso(order!.amountPaid)],
        ["Balance due", peso(order!.balanceDue)],
        ["Payment status", order!.paymentStatus],
        ["Status", order!.status],
      ],
    });
    doc.save(`laundry-receipt-${order!.orderNumber}.pdf`);
  }

  return (
    <Modal open={open} onClose={onClose} title={order.orderNumber} sub={order.customerName} maxWidth={680}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[12px] font-extrabold" style={{ background: `${LAUNDRY_STATUS_COLOR[order.status]}1A`, color: LAUNDRY_STATUS_COLOR[order.status] }}>{order.status}</span>
          <span className="text-[12.5px] text-[var(--gray)]">{order.paymentStatus} · {peso(order.amountPaid)} of {peso(order.totalAmount)} paid</span>
          {order.overdue && <span className="rounded-full bg-rausch/10 px-2.5 py-1 text-[11px] font-extrabold text-rausch">Overdue</span>}
          <div className="ml-auto flex gap-1.5">
            {canEdit && order.status !== "Cancelled" && <button onClick={onEdit} className="btn-sm btn">Edit</button>}
            <button onClick={printReceipt} className="btn-sm btn">Print receipt</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Room</div><div className="font-semibold">{order.roomNumber ?? "—"}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Contact</div><div className="font-semibold">{order.contactNumber}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Service</div><div className="font-semibold">{order.service.name}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Received</div><div className="font-semibold">{fmtDate(order.dateReceived, { month: "short", day: "numeric" })}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Due</div><div className="font-semibold">{fmtDate(order.dueDate, { month: "short", day: "numeric" })}</div></div>
          <div><div className="text-[11px] font-bold text-[var(--gray)]">Assigned to</div><div className="font-semibold">{order.assignedStaff?.name ?? "Unassigned"}</div></div>
        </div>

        <div className="rounded-xl border border-[var(--line)] p-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Items ({order.totalQuantity}, {order.totalWeight} kg)</div>
          <div className="space-y-1.5">
            {order.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-[12.5px]">
                <span>{i.itemName} <span className="text-[var(--gray)]">· {i.category}{i.color ? ` · ${i.color}` : ""}</span></span>
                <span className="text-[var(--gray)]">×{i.quantity}{i.weight ? ` · ${i.weight}kg` : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {order.notes && <p className="text-[13px] text-[var(--gray)]"><span className="font-bold text-[var(--ink)]">Notes: </span>{order.notes}</p>}

        {order.status === "Cancelled" ? (
          <div className="rounded-xl bg-[var(--bg-2)] p-3 text-[13px]">
            <span className="font-bold">Cancelled</span> — {order.cancellationReason}
          </div>
        ) : canEdit && (
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Update status</div>
            <div className="flex flex-wrap gap-1.5">
              {LAUNDRY_STATUSES.filter((s) => s !== "Cancelled").map((s) => (
                <button
                  key={s}
                  disabled={busy || s === order.status}
                  onClick={() => setStatus(s)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] font-bold transition disabled:opacity-40 ${s === order.status ? "border-transparent" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
                  style={s === order.status ? { background: `${LAUNDRY_STATUS_COLOR[s]}1A`, color: LAUNDRY_STATUS_COLOR[s] } : undefined}
                >
                  {s}
                </button>
              ))}
            </div>
            {nextStatus && (
              <button disabled={busy} onClick={() => setStatus(nextStatus)} className="btn-primary btn-sm mt-2.5">Advance to {nextStatus} →</button>
            )}
            <button onClick={() => setShowCancelForm((v) => !v)} className="ml-2 mt-2.5 text-[12px] font-bold text-rausch hover:underline">Cancel order</button>
            {showCancelForm && (
              <div className="mt-2.5 flex gap-2">
                <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation" className="field-input flex-1" />
                <button disabled={busy} onClick={cancelOrder} className="btn-sm btn flex-none">Confirm</button>
              </div>
            )}
          </div>
        )}

        {canPay && order.status !== "Cancelled" && order.balanceDue > 0 && (
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Record a payment — balance {peso(order.balanceDue)}</div>
            <div className="flex flex-wrap gap-2">
              <input type="number" min={1} max={order.balanceDue} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Amount" className="field-input w-28" />
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="field-input w-auto">
                {LAUNDRY_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{LAUNDRY_PAYMENT_METHOD_LABEL[m]}</option>)}
              </select>
              <button disabled={busy} onClick={addPayment} className="btn-primary btn-sm">Record payment</button>
              <button type="button" onClick={() => setPaymentAmount(String(order.balanceDue))} className="btn-sm btn">Full balance</button>
            </div>
          </div>
        )}

        {order.payments.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Payment history</div>
            <div className="space-y-1.5">
              {order.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-[12.5px]">
                  <span>{peso(p.amount)} · {LAUNDRY_PAYMENT_METHOD_LABEL[p.method] ?? p.method}{p.receivedBy ? ` · ${p.receivedBy.name}` : ""}</span>
                  <span className="text-[var(--gray)]">{fmtDate(p.createdAt, { month: "short", day: "numeric" })} {fmtTime(p.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Status history</div>
          <div className="space-y-1.5">
            {order.statusHistory.map((h) => (
              <div key={h.id} className="flex items-start justify-between text-[12.5px]">
                <span><span className="font-bold">{h.status}</span>{h.notes ? ` — ${h.notes}` : ""}{h.changedBy ? ` · ${h.changedBy.name}` : ""}</span>
                <span className="flex-none text-[var(--gray)]">{fmtDate(h.createdAt, { month: "short", day: "numeric" })} {fmtTime(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
