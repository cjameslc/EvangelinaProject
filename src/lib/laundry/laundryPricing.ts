// Pure functions — no Prisma import, safe to use from both server code and
// client components (the order form needs the same total-computation logic
// live, as items/service/adjustments change, before the user saves).

export type LaundryItemInput = { quantity: number; weight?: number | null };

export function itemTotals(items: LaundryItemInput[]): { totalQuantity: number; totalWeight: number } {
  return {
    totalQuantity: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
    totalWeight: Math.round(items.reduce((sum, i) => sum + (i.weight || 0), 0) * 100) / 100,
  };
}

export type LaundryServiceRate = { pricePerKg?: number | null; pricePerItem?: number | null };

/** Priced by weight when the service has a per-kg rate (the common case —
 * most laundry is charged by the kilo); falls back to per-item pricing
 * only when the service has no per-kg rate at all (e.g. a dry-cleaning-only
 * service priced strictly per piece). */
export function computeSubtotal(totals: { totalQuantity: number; totalWeight: number }, service: LaundryServiceRate): number {
  if (service.pricePerKg) return Math.round(totals.totalWeight * service.pricePerKg);
  if (service.pricePerItem) return totals.totalQuantity * service.pricePerItem;
  return 0;
}

export function computeOrderTotal(subtotal: number, discountAmount = 0, additionalCharges = 0, taxAmount = 0): number {
  return Math.max(0, subtotal - discountAmount + additionalCharges + taxAmount);
}

export type PaymentStatus = "Unpaid" | "Partial" | "Paid";

/** Deliberately derived, never stored — see LaundryOrder's schema comment.
 * A cancelled order is never "outstanding," regardless of what's been
 * paid so far — it just reports whatever was actually collected. */
export function paymentStatusFor(totalAmount: number, amountPaid: number): PaymentStatus {
  if (amountPaid <= 0) return "Unpaid";
  if (amountPaid >= totalAmount) return "Paid";
  return "Partial";
}

export function remainingBalance(totalAmount: number, amountPaid: number): number {
  return Math.max(0, totalAmount - amountPaid);
}

/** A ticket is overdue once its due date has passed without having reached
 * a terminal state (picked up or cancelled) — mirrors the same
 * "computed, not stored" discipline as paymentStatusFor. */
export function isOverdue(dueDate: Date | string, status: string, now: Date = new Date()): boolean {
  if (status === "Delivered" || status === "Cancelled") return false;
  return new Date(dueDate).getTime() < now.getTime();
}
