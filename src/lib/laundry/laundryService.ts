import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { unitScope } from "@/lib/rbac";
import { generateLaundryOrderNumber } from "@/lib/laundry/laundryOrderNumber";
import { itemTotals, computeSubtotal, computeOrderTotal } from "@/lib/laundry/laundryPricing";
import type { laundryOrderSchema, laundryStatusUpdateSchema, laundryPaymentSchema, laundryServiceSchema } from "@/lib/validation";
import type { z } from "zod";

export const laundryOrderSelect = {
  id: true, orderNumber: true, customerName: true, roomNumber: true, unitId: true, contactNumber: true,
  dateReceived: true, dueDate: true, serviceId: true, assignedStaffId: true,
  totalWeight: true, totalQuantity: true, subtotal: true, discountAmount: true, additionalCharges: true, taxAmount: true, totalAmount: true,
  status: true, notes: true, cancelledAt: true, cancellationReason: true, createdById: true, createdAt: true, updatedAt: true,
  unit: { select: { id: true, name: true, shortName: true, unitNumber: true } },
  service: { select: { id: true, name: true, pricePerKg: true, pricePerItem: true } },
  assignedStaff: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: true,
  payments: { orderBy: { createdAt: "desc" as const } },
} as const;

export type LaundryOrderInput = z.infer<typeof laundryOrderSchema>;

async function resolveTotals(input: LaundryOrderInput) {
  const service = await prisma.laundryService.findUnique({ where: { id: input.serviceId }, select: { pricePerKg: true, pricePerItem: true } });
  if (!service) throw new Error("That service no longer exists.");
  const totals = itemTotals(input.items);
  const subtotal = computeSubtotal(totals, service);
  const discountAmount = input.discountAmount ?? 0;
  const additionalCharges = input.additionalCharges ?? 0;
  const taxAmount = input.taxAmount ?? 0;
  const totalAmount = input.totalAmountOverride ?? computeOrderTotal(subtotal, discountAmount, additionalCharges, taxAmount);
  return { ...totals, subtotal, discountAmount, additionalCharges, taxAmount, totalAmount };
}

export async function createLaundryOrder(userId: string, input: LaundryOrderInput) {
  const totals = await resolveTotals(input);
  const orderNumber = await generateLaundryOrderNumber();

  const order = await prisma.laundryOrder.create({
    data: {
      orderNumber,
      customerName: input.customerName,
      roomNumber: input.roomNumber || null,
      unitId: input.unitId || null,
      contactNumber: input.contactNumber,
      dateReceived: new Date(input.dateReceived),
      dueDate: new Date(input.dueDate),
      serviceId: input.serviceId,
      assignedStaffId: input.assignedStaffId || null,
      notes: input.notes || null,
      createdById: userId,
      ...totals,
      items: { create: input.items.map((i) => ({ itemName: i.itemName, category: i.category, quantity: i.quantity, weight: i.weight ?? null, color: i.color || null, condition: i.condition || null, specialInstructions: i.specialInstructions || null })) },
      statusHistory: { create: { status: "Received", changedById: userId, notes: "Order created" } },
    },
    select: laundryOrderSelect,
  });
  await logAudit(userId, "laundry.order.create", "LaundryOrder", order.id, { orderNumber: order.orderNumber, customerName: order.customerName, totalAmount: order.totalAmount });
  return order;
}

export async function updateLaundryOrder(id: string, userId: string, input: LaundryOrderInput) {
  const existing = await prisma.laundryOrder.findUnique({ where: { id }, select: { id: true, status: true, totalAmount: true } });
  if (!existing) throw new Error("Laundry order not found.");
  const totals = await resolveTotals(input);

  const order = await prisma.$transaction(async (tx) => {
    await tx.laundryItem.deleteMany({ where: { orderId: id } });
    return tx.laundryOrder.update({
      where: { id },
      data: {
        customerName: input.customerName,
        roomNumber: input.roomNumber || null,
        unitId: input.unitId || null,
        contactNumber: input.contactNumber,
        dateReceived: new Date(input.dateReceived),
        dueDate: new Date(input.dueDate),
        serviceId: input.serviceId,
        assignedStaffId: input.assignedStaffId || null,
        notes: input.notes || null,
        ...totals,
        items: { create: input.items.map((i) => ({ itemName: i.itemName, category: i.category, quantity: i.quantity, weight: i.weight ?? null, color: i.color || null, condition: i.condition || null, specialInstructions: i.specialInstructions || null })) },
      },
      select: laundryOrderSelect,
    });
  });
  await logAudit(userId, "laundry.order.update", "LaundryOrder", order.id, { previousTotalAmount: existing.totalAmount, newTotalAmount: order.totalAmount });
  return order;
}

export async function cancelLaundryOrder(id: string, userId: string, reason: string) {
  const existing = await prisma.laundryOrder.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new Error("Laundry order not found.");
  if (existing.status === "Cancelled") throw new Error("This order is already cancelled.");

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.laundryOrder.update({
      where: { id },
      data: { status: "Cancelled", cancelledAt: new Date(), cancellationReason: reason },
      select: laundryOrderSelect,
    });
    await tx.laundryStatusHistory.create({ data: { orderId: id, status: "Cancelled", changedById: userId, notes: reason } });
    return updated;
  });
  await logAudit(userId, "laundry.order.cancel", "LaundryOrder", id, { previousStatus: existing.status, reason });
  return order;
}

export type LaundryStatusUpdateInput = z.infer<typeof laundryStatusUpdateSchema>;

export async function updateLaundryStatus(id: string, userId: string, input: LaundryStatusUpdateInput) {
  const existing = await prisma.laundryOrder.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new Error("Laundry order not found.");
  if (existing.status === "Cancelled") throw new Error("This order is cancelled — reactivate it isn't supported, create a new order instead.");

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.laundryOrder.update({ where: { id }, data: { status: input.status }, select: laundryOrderSelect });
    await tx.laundryStatusHistory.create({ data: { orderId: id, status: input.status, changedById: userId, notes: input.notes || null } });
    return updated;
  });
  await logAudit(userId, "laundry.order.status_change", "LaundryOrder", id, { previousStatus: existing.status, newStatus: input.status, notes: input.notes });
  return order;
}

export type LaundryPaymentInput = z.infer<typeof laundryPaymentSchema>;

export async function addLaundryPayment(id: string, userId: string, input: LaundryPaymentInput) {
  const order = await prisma.laundryOrder.findUnique({ where: { id }, select: { id: true, totalAmount: true, payments: { select: { amount: true } } } });
  if (!order) throw new Error("Laundry order not found.");
  const alreadyPaid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  if (alreadyPaid >= order.totalAmount) throw new Error("This order is already fully paid.");

  const payment = await prisma.laundryPayment.create({
    data: { orderId: id, amount: input.amount, method: input.method, notes: input.notes || null, receivedById: userId },
  });
  await logAudit(userId, "laundry.payment.add", "LaundryOrder", id, { amount: input.amount, method: input.method });
  return payment;
}

export async function getLaundryOrder(id: string) {
  return prisma.laundryOrder.findUnique({
    where: { id },
    select: { ...laundryOrderSelect, statusHistory: { orderBy: { createdAt: "desc" }, include: { changedBy: { select: { id: true, name: true } } } } },
  });
}

export async function listLaundryOrders(opts: { take?: number } = {}) {
  return prisma.laundryOrder.findMany({ orderBy: { createdAt: "desc" }, select: laundryOrderSelect, ...(opts.take ? { take: opts.take } : {}) });
}

/** Every list-shaped laundry endpoint (order list, dashboard, reports) needs
 * the same Co-owner scoping — a walk-in laundry order (unitId null) is
 * always visible to everyone with Housekeeping access; a unit-linked one
 * is scoped like every other unit-bearing query in the app. One place, so
 * the three callers can't drift on the null-unitId edge case.
 *
 * `opts.take` is opt-in and only meant for the interactive orders-list
 * panel (LaundryOrdersList.tsx already only shows PAGE_SIZE=15 at a time
 * client-side anyway) — the dashboard/export/reports callers deliberately
 * leave it unset, since an export or report silently truncating to "most
 * recent N" instead of the real full history would be a correctness bug,
 * not a performance win. Same unbounded-growth shape this session already
 * fixed for /bookings (see docs/Performance.md), applied narrowly here
 * rather than as a blanket change to every caller. */
export async function listLaundryOrdersForUser(user: { role: string; ownedUnitIds: string[] }, opts: { take?: number } = {}) {
  const scope = unitScope(user.role as any, user.ownedUnitIds);
  if (scope === "all") return listLaundryOrders(opts);
  return prisma.laundryOrder.findMany({
    where: { OR: [{ unitId: null }, { unitId: { in: scope } }] },
    orderBy: { createdAt: "desc" },
    select: laundryOrderSelect,
    ...(opts.take ? { take: opts.take } : {}),
  });
}

export async function listLaundryServices() {
  return prisma.laundryService.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export type LaundryServiceInput = z.infer<typeof laundryServiceSchema>;

export async function createLaundryService(userId: string, input: LaundryServiceInput) {
  const service = await prisma.laundryService.create({
    data: {
      name: input.name, description: input.description || null,
      pricePerKg: input.pricePerKg ?? null, pricePerItem: input.pricePerItem ?? null,
      estimatedTurnaroundHours: input.estimatedTurnaroundHours ?? 24,
      active: input.active ?? true, sortOrder: input.sortOrder ?? 0,
    },
  });
  await logAudit(userId, "laundry.service.create", "LaundryService", service.id, { name: service.name });
  return service;
}

export async function updateLaundryService(id: string, userId: string, input: Partial<LaundryServiceInput>) {
  const service = await prisma.laundryService.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description || null }),
      ...(input.pricePerKg !== undefined && { pricePerKg: input.pricePerKg }),
      ...(input.pricePerItem !== undefined && { pricePerItem: input.pricePerItem }),
      ...(input.estimatedTurnaroundHours !== undefined && { estimatedTurnaroundHours: input.estimatedTurnaroundHours }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });
  await logAudit(userId, "laundry.service.update", "LaundryService", id, input);
  return service;
}
