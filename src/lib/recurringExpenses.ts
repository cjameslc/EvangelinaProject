import { prisma } from "@/lib/prisma";
import type { ExpenseCategory } from "@/lib/prisma-enums";

/** Maps a template's category to the underlying Bill.key so existing bill-key-based UI (icons, filters) keeps working without a rewrite. */
export const CATEGORY_TO_BILL_KEY: Record<ExpenseCategory, string> = {
  Amortization: "amort",
  Utilities: "elec",
  Water: "water",
  Internet: "net",
  AssociationDues: "assoc",
  Streaming: "stream",
};

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Resolves a template's due day to a concrete day-of-month for a specific month — a fixed dueDay is used as-is; "LAST_WEEK" resolves to the month's final day, i.e. the end of that last-7-day window (not the start), so a Dashboard's exact-date `dueDate < today` overdue check doesn't fire prematurely on days still inside the window. */
export function resolveDueDay(template: { dueDay: number | null; dueRule: string | null }, year: number, month0: number): number | null {
  if (template.dueDay != null) return template.dueDay;
  if (template.dueRule === "LAST_WEEK") return daysInMonth(year, month0);
  return null;
}

/**
 * Ensures every active RecurringExpenseTemplate has exactly one Bill for the
 * given month, creating any missing ones as Pending (paid: false). Idempotent
 * and safe to call from every page that reads bills — a template can never
 * end up with two bills for the same month because each generated bill is
 * looked up by templateId+month first.
 */
export async function ensureRecurringBillsForMonth(month: Date): Promise<void> {
  const templates = await prisma.recurringExpenseTemplate.findMany({ where: { active: true } });
  if (templates.length === 0) return;

  const existing = await prisma.bill.findMany({
    where: { templateId: { in: templates.map((t) => t.id) }, month },
    select: { templateId: true },
  });
  const haveBill = new Set(existing.map((b) => b.templateId));

  const year = month.getUTCFullYear();
  const month0 = month.getUTCMonth();

  const missing = templates.filter((t) => !haveBill.has(t.id));
  if (missing.length === 0) return;

  await prisma.bill.createMany({
    data: missing.map((t) => ({
      unitId: t.unitId,
      key: CATEGORY_TO_BILL_KEY[t.category as ExpenseCategory] as any,
      label: t.description,
      month,
      dueDay: resolveDueDay(t, year, month0),
      amountDue: Math.round(t.amountCentavos / 100),
      amountDueCentavos: t.amountCentavos,
      accountNumber: t.accountNumber,
      paid: false,
      templateId: t.id,
    })),
  });
}
