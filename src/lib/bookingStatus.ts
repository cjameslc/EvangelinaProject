// Pure, Prisma-free booking-completion check — deliberately its own module
// (not gamification.ts, which imports the Prisma client) because this is
// also used from payroll.ts, which is imported by client components
// (WeeklyReport.tsx, StaffTab.tsx, EarningsView.tsx). Importing anything
// that transitively pulls in @/lib/prisma from a client-bundled module
// breaks the client build.

/** A booking counts toward commission/gamification once its stay has actually finished. */
export function isBookingCompleted(booking: { date: Date | string; checkOutDate: Date | string | null }, now: Date = new Date()): boolean {
  const end = booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(booking.date);
  return end.getTime() <= now.getTime();
}
