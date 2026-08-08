import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/ownerScope";
import { logAudit } from "@/lib/session";
import { createOwnerSchema } from "@/lib/validation";
import { parseOrError, isUniqueConstraintError } from "@/lib/apiValidation";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "owner";
}

/** Appends a numeric suffix until `candidate` doesn't collide — used for
 * both Owner.slug and User.username, which are both @unique. Small enough
 * space (platform admin creates owners one at a time, not a bulk import)
 * that a simple retry loop is fine; no need for a smarter allocator. */
async function uniqueValue(base: string, exists: (value: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** Platform Admin only — the one place in the app allowed to list every
 * owner at once (see requirePlatformAdmin's doc comment). Owner counts are
 * cheap aggregate queries, not full unit/user payloads. */
export async function GET() {
  const { error } = await requirePlatformAdmin();
  if (error) return error;

  const owners = await prisma.owner.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { units: true, users: true } } },
  });
  return NextResponse.json(owners);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const parsed = parseOrError(createOwnerSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const slug = await uniqueValue(slugify(body.businessName), async (s) => !!(await prisma.owner.findUnique({ where: { slug: s }, select: { id: true } })));
  const username = await uniqueValue(slugify(body.ownerName), async (u) => !!(await prisma.user.findUnique({ where: { username: u }, select: { id: true } })));

  // A generated temporary password, shown once in the response — this
  // foundational pass has no email-invitation system yet (see the
  // multi-owner brief's staff-invitation section, deferred), so the
  // Platform Admin hands this off to the new owner directly. mustChangePassword
  // forces them to set their own on first login.
  const tempPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    const owner = await prisma.owner.create({
      data: {
        businessName: body.businessName,
        slug,
        primaryColor: body.primaryColor || null,
        logoUrl: body.logoUrl || null,
      },
    });
    const ownerUser = await prisma.user.create({
      data: {
        name: body.ownerName,
        username,
        email: body.email,
        passwordHash,
        role: "OWNER_ADMIN",
        ownerId: owner.id,
        mustChangePassword: true,
      },
    });
    // OWNER_ADMIN isn't a payroll role (see ensureEmployeeForUser), so no
    // linked Employee record is expected here — matches how Evangelina's
    // own OWNER_ADMIN accounts already work today.
    await logAudit(user.id, "platform.owner.create", "Owner", owner.id, { businessName: owner.businessName, slug: owner.slug, ownerUserId: ownerUser.id });
    return NextResponse.json({ owner, login: { username, tempPassword } }, { status: 201 });
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That business name or owner name is already taken." }, { status: 409 });
    throw e;
  }
}
