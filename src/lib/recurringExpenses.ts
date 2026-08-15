import { prisma } from "@/lib/prisma";
import type { ExpenseCategory } from "@/lib/prisma-enums";
import { isUniqueConstraintError } from "@/lib/apiValidation";

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

function findMissing<T extends { id: string }>(templates: T[], existing: { templateId: string | null }[]): T[] {
  const haveBill = new Set(existing.map((b) => b.templateId));
  return templates.filter((t) => !haveBill.has(t.id));
}

/**
 * Ensures every active RecurringExpenseTemplate has exactly one Bill for the
 * given month, creating any missing ones as Pending (paid: false). Idempotent
 * and safe to call from every page that reads bills — which, for nearly
 * every real call, means every template already has this month's bill (the
 * first page load after month rollover is the one exception) and this
 * should be as close to "two cheap reads, nothing else" as possible.
 *
 * Optimistic-then-pessimistic, not one unconditional transaction: an initial
 * untransacted read decides whether there's anything to do at all — the
 * overwhelmingly common case — and only opens a prisma.$transaction (a real
 * BEGIN/COMMIT round trip pair) when that read finds something missing,
 * re-checking inside the transaction before creating anything since another
 * caller could have filled it in the moment between the two reads. An
 * earlier version always transacted, including the empty-result case, which
 * measured ~780ms per call purely from the unconditional BEGIN+COMMIT
 * overhead on what should be a single cheap SELECT; this version keeps that
 * fast path untransacted.
 *
 * The transaction itself exists because the libSQL driver-adapter's
 * client-side mutex (see prisma.ts) only serializes individual queries, not
 * a whole read-then-write sequence — two concurrent callers could each
 * still read "27 missing" and each attempt all 27 creates, wasting up to
 * N x (concurrent callers) round trips even though only N could ever
 * succeed. A real 8-way-concurrent test against a brand-new month measured
 * ~27s with a loose per-call read+write loop, ~8s once the read+write moved
 * inside one transaction per caller (a second caller's transaction-scoped
 * read only starts once the first has fully committed, so it correctly
 * sees "0 missing" instead of redoing the same 27 creates). The
 * @@unique([templateId, month]) constraint on Bill stays as a defense-in-
 * depth backstop regardless (SQLite's deferred-transaction locking can, in
 * rare interleavings, still let two reads slip past each other before
 * either takes a write lock) — isUniqueConstraintError below is expected to
 * fire rarely, not on every losing request.
 */
export async function ensureRecurringBillsForMonth(month: Date, ownerId: string | null): Promise<void> {
  // ownerId-scoped — previously generated bills from EVERY tenant's active
  // templates on every call, regardless of who was viewing. Found during
  // the Felian multi-owner audit; see RecurringExpenseTemplate/Bill's own
  // ownerId doc comments.
  const templates = await prisma.recurringExpenseTemplate.findMany({ where: { active: true, ownerId } });
  if (templates.length === 0) return;

  const templateIds = templates.map((t) => t.id);
  const existing = await prisma.bill.findMany({ where: { templateId: { in: templateIds }, month }, select: { templateId: true } });
  if (findMissing(templates, existing).length === 0) return;

  const year = month.getUTCFullYear();
  const month0 = month.getUTCMonth();

  await prisma.$transaction(async (tx) => {
    const existingTx = await tx.bill.findMany({ where: { templateId: { in: templateIds }, month }, select: { templateId: true } });
    const missing = findMissing(templates, existingTx);
    if (missing.length === 0) return;

    for (const t of missing) {
      try {
        await tx.bill.create({
          data: {
            ownerId: t.ownerId,
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
          },
        });
      } catch (e) {
        if (!isUniqueConstraintError(e)) throw e;
      }
    }
  });
}
