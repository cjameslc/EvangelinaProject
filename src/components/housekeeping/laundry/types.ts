// Client-side shapes matching the JSON the laundry API routes actually
// return (see laundryOrderSelect/withDerived in laundryService.ts /
// laundryReports.ts) — dates arrive as ISO strings over the wire.

export type LaundryItemRow = {
  id: string; itemName: string; category: string; quantity: number; weight: number | null;
  color: string | null; condition: string | null; specialInstructions: string | null;
};

export type LaundryPaymentRow = {
  id: string; amount: number; method: string; notes: string | null; createdAt: string;
  receivedBy: { id: string; name: string } | null;
};

export type LaundryServiceRow = {
  id: string; name: string; description: string | null; pricePerKg: number | null; pricePerItem: number | null;
  estimatedTurnaroundHours: number; active: boolean; sortOrder: number;
};

export type LaundryOrder = {
  id: string; orderNumber: string; customerName: string; roomNumber: string | null; unitId: string | null;
  contactNumber: string; dateReceived: string; dueDate: string;
  serviceId: string; service: { id: string; name: string; pricePerKg: number | null; pricePerItem: number | null };
  assignedStaffId: string | null; assignedStaff: { id: string; name: string } | null;
  totalWeight: number; totalQuantity: number; subtotal: number; discountAmount: number; additionalCharges: number; taxAmount: number; totalAmount: number;
  status: string; notes: string | null; cancelledAt: string | null; cancellationReason: string | null;
  createdBy: { id: string; name: string } | null; createdAt: string; updatedAt: string;
  unit: { id: string; name: string; shortName: string; unitNumber: string } | null;
  items: LaundryItemRow[];
  payments: LaundryPaymentRow[];
  amountPaid: number;
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  balanceDue: number;
  overdue: boolean;
};

export type LaundryOrderDetail = LaundryOrder & {
  statusHistory: { id: string; status: string; notes: string | null; createdAt: string; changedBy: { id: string; name: string } | null }[];
};

export type LaundryDashboardData = {
  stats: {
    totalOrders: number; receivedToday: number; inProgress: number; readyForPickup: number;
    completed: number; overdue: number; todaysRevenue: number; monthlyRevenue: number;
  };
  dailyOrders: { label: string; count: number }[];
  revenueTrend: { label: string; revenue: number }[];
  statusDistribution: { key: string; label: string; count: number }[];
  recentOrders: LaundryOrder[];
};

export type LaundryReportsData = {
  totalRevenue: number;
  totalVolumeKg: number;
  ordersByStatus: { status: string; count: number }[];
  outstandingPayments: LaundryOrder[];
  outstandingTotal: number;
  mostRequestedServices: { name: string; count: number }[];
  avgProcessingHours: number;
};
