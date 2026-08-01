import type { DashboardPeriodType } from "@/lib/payroll";

export type Unit = {
  id: string; name: string; shortName: string; unitNumber: string; nightlyRate: number; rating: number; photoUrl: string | null; location: string;
  owners?: { user: { name: string } }[]; icalLastSyncError?: string | null;
  ttlockLockId?: number | null; ttlockBatteryPct?: number | null; ttlockHasGateway?: boolean | null; ttlockBatterySyncedAt?: string | null;
  monthlyRevenueTargetOverride?: number | null;
};
export type Booking = { id: string; unitId: string; unit?: Unit; date: string; checkOutDate: string | null; checkInTime: string | null; checkOutTime: string | null; stayType: string; platform: string; amount: number; paid: boolean; dpAmount: number | null; guests: string[]; receivedById: string | null; dpReceivedById: string | null; cleanerId: string | null; bookerId: string | null; conflict?: boolean; cancelledAt?: string | null; refundedAt?: string | null };
export type Employee = { id: string; name: string; role: string; monthlySalary: number; active?: boolean; userId?: string | null };
export type Bill = { id: string; unitId: string | null; key: string; label: string | null; month: string; dueDay: number | null; amountDue: number; amountPaid: number | null; amountDueCentavos?: number | null; amountPaidCentavos?: number | null; paid: boolean; unit: Unit | null };
export type HkState = { unitId: string; status: string; unit: Unit; cleanedBookingIds?: string[] };
export type WeeklyExpenseRow = { id: string; date: string; createdAt?: string; amount: number; note: string; category?: "GENERAL" | "TIKTOK_ADS"; targetEmployee: Employee | null; addedBy: { id: string; name: string } | null };

// "Needs your attention" card — a lightweight cross-section of open Auditor
// findings, this week's due bills, and low stock. Not the full records (the
// Auditor page / Housekeeping page own those), just enough to flag them here.
export type AttentionFinding = {
  id: string; title: string; notes: string | null; recommendedAction: string | null;
  category: string; severity: "Critical" | "Warning"; unit: { shortName: string } | null; employee: { name: string } | null;
};
export type Stock = { id: string; unitId: string; name: string; count: number };

export type RangeType = DashboardPeriodType;
export type StatusFilter = "all" | "occupied" | "reserved" | "cleaning" | "available";
