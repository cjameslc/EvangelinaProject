import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, findDuplicateBusinessName } from "@/lib/ownerScope";
import { logAudit } from "@/lib/session";
import { updateOwnerSchema } from "@/lib/validation";
import { parseOrError } from "@/lib/apiValidation";

/**
 * Platform Admin editing an existing owner's tenant details — business
 * name, brand color, icon, ACTIVE/SUSPENDED status, and/or module tier
 * (see Owner.enabledModules / effectivePageAccess() in
 * src/lib/pageAccess.ts). Every field is optional so this one route
 * serves both PlatformView's "Edit tenant" modal (name/color/icon/status)
 * and its narrower "Edit page access" modal (enabledModules only) without
 * two near-identical endpoints.
 *
 * slug is deliberately never accepted here — see updateOwnerSchema's own
 * comment for why.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const parsed = parseOrError(updateOwnerSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const existing = await prisma.owner.findUnique({ where: { id: params.id }, select: { id: true, businessName: true } });
  if (!existing) return NextResponse.json({ error: "Owner not found." }, { status: 404 });

  if (body.businessName !== undefined && (await findDuplicateBusinessName(body.businessName, params.id))) {
    return NextResponse.json({ error: "A staycation with this business name already exists." }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (body.businessName !== undefined) data.businessName = body.businessName;
  if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor;
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl;
  if (body.status !== undefined) data.status = body.status;
  if (body.enabledModules !== undefined) data.enabledModules = body.enabledModules === null ? null : JSON.stringify(body.enabledModules);

  const owner = await prisma.owner.update({ where: { id: params.id }, data });
  await logAudit(user.id, "platform.owner.update", "Owner", owner.id, {
    businessName: body.businessName, primaryColor: body.primaryColor, logoUrl: body.logoUrl !== undefined,
    status: body.status, enabledModules: body.enabledModules,
  });
  return NextResponse.json(owner);
}

/**
 * Platform Admin deleting a tenant — deliberately restrictive: blocked
 * the moment the owner has even one Unit. Every relation a real business
 * would actually care about (Booking, CalendarBlock, AccessCredential,
 * financial history) hangs off Unit, never Owner directly, and none of
 * those tables cascade from Owner — User/Unit/Employee/Coupon's own
 * ownerId relations are all onDelete: SetNull, meaning a raw
 * prisma.owner.delete() on a tenant with real data wouldn't actually
 * delete that data, it would silently orphan it (ownerId -> null), a
 * worse, half-broken state than either deleting cleanly or not deleting
 * at all. Restricting to zero-unit tenants sidesteps all of that — there
 * is no unit-derived history to strand, ever. A tenant with real units
 * should be suspended (PATCH status: SUSPENDED) instead, never deleted.
 *
 * Explicitly deletes User/Employee/Coupon rows rather than letting
 * SetNull orphan them — a login with ownerId: null isn't a safe or
 * meaningful state anywhere else in this app's ownerId-scoped access
 * checks, so it shouldn't be able to exist even transiently.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const owner = await prisma.owner.findUnique({
    where: { id: params.id },
    select: { id: true, businessName: true, slug: true, _count: { select: { units: true } } },
  });
  if (!owner) return NextResponse.json({ error: "Owner not found." }, { status: 404 });
  if (owner._count.units > 0) {
    return NextResponse.json(
      { error: "This staycation has real units — remove or reassign them first, or suspend the tenant instead of deleting it." },
      { status: 409 }
    );
  }

  const [deletedUsers, deletedEmployees] = await prisma.$transaction([
    prisma.user.deleteMany({ where: { ownerId: owner.id } }),
    prisma.employee.deleteMany({ where: { ownerId: owner.id } }),
    prisma.coupon.deleteMany({ where: { ownerId: owner.id } }),
    prisma.settings.deleteMany({ where: { ownerId: owner.id } }),
  ]);
  await prisma.owner.delete({ where: { id: owner.id } });

  await logAudit(user.id, "platform.owner.delete", "Owner", owner.id, {
    businessName: owner.businessName, slug: owner.slug, deletedUsers: deletedUsers.count, deletedEmployees: deletedEmployees.count,
  });
  return NextResponse.json({ ok: true });
}
