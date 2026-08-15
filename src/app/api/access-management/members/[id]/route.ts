import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { isGrantablePage } from "@/lib/pageAccess";
import { isGrantableAction } from "@/lib/actionAccess";
import { parseOrError } from "@/lib/apiValidation";

const bodySchema = z.object({ pages: z.array(z.string()), actions: z.array(z.string()).optional() });

/**
 * Replaces this member's full set of Owner-granted additional pages (and,
 * if present, actions) with exactly what's submitted (idempotent set, not
 * an incremental toggle) — matches how the Access Management UI's checkbox
 * grid works: it always submits the complete desired state, not a single
 * add/remove. `actions` is optional so existing callers that only manage
 * page access keep working unchanged; omitting it leaves action grants
 * untouched rather than clearing them.
 *
 * Every actual change (not the whole submitted set — just what differs from
 * what was already there) gets its own audit log entry, so the log reads
 * as "added Analytics" / "granted Delete booking" rather than one opaque
 * "changed access" blob.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user: actor, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  const parsed = parseOrError(bodySchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true, ownerId: true },
  });
  if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
  // Same tenant boundary every other admin write already enforces (see
  // isUnitInScope's doc comment) — an Owner may only configure access for
  // their own staff, never another owner's.
  if (target.ownerId !== actor.ownerId) return NextResponse.json({ error: "Member not found." }, { status: 404 });
  if (target.role === "OWNER_ADMIN") {
    return NextResponse.json({ error: "Owner/Admin already has full access — nothing to configure." }, { status: 400 });
  }

  const requestedPages = Array.from(new Set(parsed.data.pages));
  const invalidPages = requestedPages.filter((p) => !isGrantablePage(p));
  if (invalidPages.length > 0) {
    return NextResponse.json({ error: `Not a grantable page: ${invalidPages.join(", ")}` }, { status: 400 });
  }

  const requestedActions = parsed.data.actions !== undefined ? Array.from(new Set(parsed.data.actions)) : null;
  if (requestedActions) {
    const invalidActions = requestedActions.filter((a) => !isGrantableAction(a));
    if (invalidActions.length > 0) {
      return NextResponse.json({ error: `Not a grantable action: ${invalidActions.join(", ")}` }, { status: 400 });
    }
  }

  const [existingPagesRows, existingActionsRows] = await Promise.all([
    prisma.memberPageAccess.findMany({ where: { userId: target.id }, select: { page: true } }),
    requestedActions ? prisma.memberActionAccess.findMany({ where: { userId: target.id }, select: { action: true } }) : Promise.resolve(null),
  ]);
  const existingPages = new Set(existingPagesRows.map((e) => e.page));
  const pagesToAdd = requestedPages.filter((p) => !existingPages.has(p));
  const pagesToRemove = [...existingPages].filter((p) => !requestedPages.includes(p));

  const existingActions = existingActionsRows ? new Set(existingActionsRows.map((e) => e.action)) : null;
  const actionsToAdd = requestedActions && existingActions ? requestedActions.filter((a) => !existingActions.has(a)) : [];
  const actionsToRemove = requestedActions && existingActions ? [...existingActions].filter((a) => !requestedActions.includes(a)) : [];

  const nothingChanged = pagesToAdd.length === 0 && pagesToRemove.length === 0 && actionsToAdd.length === 0 && actionsToRemove.length === 0;
  if (nothingChanged) {
    return NextResponse.json({ additionalPages: requestedPages, additionalActions: requestedActions ?? [...(existingActions ?? [])], changed: false });
  }

  await prisma.$transaction([
    ...(pagesToAdd.length > 0
      ? [prisma.memberPageAccess.createMany({ data: pagesToAdd.map((page) => ({ userId: target.id, page, grantedById: actor.id })) })]
      : []),
    ...(pagesToRemove.length > 0
      ? [prisma.memberPageAccess.deleteMany({ where: { userId: target.id, page: { in: pagesToRemove } } })]
      : []),
    ...(actionsToAdd.length > 0
      ? [prisma.memberActionAccess.createMany({ data: actionsToAdd.map((action) => ({ userId: target.id, action, grantedById: actor.id })) })]
      : []),
    ...(actionsToRemove.length > 0
      ? [prisma.memberActionAccess.deleteMany({ where: { userId: target.id, action: { in: actionsToRemove } } })]
      : []),
  ]);

  for (const page of pagesToAdd) await logAudit(actor.id, "access.page_granted", "User", target.id, { member: target.name, page });
  for (const page of pagesToRemove) await logAudit(actor.id, "access.page_revoked", "User", target.id, { member: target.name, page });
  for (const action of actionsToAdd) await logAudit(actor.id, "access.action_granted", "User", target.id, { member: target.name, action });
  for (const action of actionsToRemove) await logAudit(actor.id, "access.action_revoked", "User", target.id, { member: target.name, action });

  return NextResponse.json({
    additionalPages: requestedPages,
    additionalActions: requestedActions ?? [...(existingActions ?? [])],
    changed: true,
    added: [...pagesToAdd, ...actionsToAdd],
    removed: [...pagesToRemove, ...actionsToRemove],
  });
}
