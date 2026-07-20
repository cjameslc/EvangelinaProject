import { NextRequest, NextResponse } from "next/server";
import { requireUser, unitIdWhere } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE_MAX = 100;

// Backs the Calendar page's Sync History panel. Always returns the two
// cheap "summary" fields (last successful sync + the most recent attempt,
// scoped to units this user can see) so the panel's collapsed header stays
// accurate even before anyone expands it; the paginated `logs` list itself
// is only computed when the caller isn't asking for `summaryOnly` — the
// panel requests that on mount/after every sync, and only pays for the full
// query once it's actually expanded.
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const scopedUnitWhere = unitIdWhere(user);
  const visibleUnitIds = scopedUnitWhere.id ? (scopedUnitWhere.id as { in: string[] }).in : null;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(sp.get("pageSize")) || 20));
  const summaryOnly = sp.get("summaryOnly") === "1";
  const unitId = sp.get("unitId") || undefined;
  const status = sp.get("status"); // "success" | "failed"
  const syncType = sp.get("syncType"); // "AUTOMATIC" | "MANUAL"
  const search = sp.get("search")?.trim() || undefined;
  const dateFrom = sp.get("dateFrom") || undefined;
  const dateTo = sp.get("dateTo") || undefined;
  const sort = sp.get("sort") === "oldest" ? "asc" : "desc";

  const where: Prisma.IcalSyncLogWhereInput = {
    ...(visibleUnitIds ? { unitId: { in: visibleUnitIds } } : {}),
    ...(unitId ? { unitId } : {}),
    ...(status === "success" ? { ok: true } : status === "failed" ? { ok: false } : {}),
    ...(syncType === "AUTOMATIC" || syncType === "MANUAL" ? { syncType } : {}),
    ...(dateFrom || dateTo
      ? { startedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}) } }
      : {}),
    // SQLite/libSQL's `contains` filter has no case-insensitive `mode`
    // option (that's Postgres-only in Prisma) — search is case-sensitive
    // here now. Low-stakes: this is an admin-only sync-log search box.
    ...(search
      ? {
          OR: [
            { error: { contains: search } },
            { unit: { is: { OR: [{ shortName: { contains: search } }, { unitNumber: { contains: search } }] } } },
          ],
        }
      : {}),
  };

  const [lastSuccessful, latest] = await Promise.all([
    prisma.icalSyncLog.findFirst({
      where: { ok: true, ...(visibleUnitIds ? { unitId: { in: visibleUnitIds } } : {}) },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.icalSyncLog.findFirst({
      where: visibleUnitIds ? { unitId: { in: visibleUnitIds } } : {},
      orderBy: { startedAt: "desc" },
      select: { ok: true, startedAt: true },
    }),
  ]);

  const summary = {
    lastSuccessfulSync: lastSuccessful?.startedAt ?? null,
    latestOk: latest?.ok ?? null,
    latestAt: latest?.startedAt ?? null,
  };

  if (summaryOnly) {
    return NextResponse.json({ summary, logs: [], total: 0, page: 1, pageSize });
  }

  const [total, logs] = await Promise.all([
    prisma.icalSyncLog.count({ where }),
    prisma.icalSyncLog.findMany({
      where,
      orderBy: { startedAt: sort },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { unit: { select: { shortName: true, unitNumber: true } } },
    }),
  ]);

  return NextResponse.json({ summary, logs, total, page, pageSize });
}
