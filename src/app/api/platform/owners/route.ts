import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, findDuplicateBusinessName } from "@/lib/ownerScope";
import { logAudit } from "@/lib/session";
import { createOwnerSchema } from "@/lib/validation";
import { parseOrError, isUniqueConstraintError } from "@/lib/apiValidation";
import { ensureEmployeeForUser } from "@/lib/employeeProvision";

// Every newly-created owner starts on this limited default tier unless the
// Create Owner form's module checklist was changed (see
// Owner.enabledModules / effectivePageAccess() in src/lib/pageAccess.ts) —
// Evangelina's own owner row, and any owner that existed before this field
// was added, has enabledModules: null (unrestricted) and is untouched by
// this.
const DEFAULT_NEW_OWNER_MODULES = ["/dashboard", "/analytics", "/calendar", "/housekeeping", "/admin"];

// Every newly-created owner's first login starts on this same known
// password (not a randomly generated one) — a Platform Admin decision, so
// it never needs to be individually relayed/copied per tenant. Safe only
// because mustChangePassword below is enforced server-side (middleware.ts
// redirects every route but /change-password until it's cleared), not
// merely a UI hint — the window this password is actually valid for is
// exactly "until they first sign in."
const DEFAULT_NEW_OWNER_PASSWORD = "25462546";

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

  // adminUsers backs the Platform list's "Admin: @username" line — every
  // active OWNER_ADMIN on the tenant (there can be more than one, e.g. a
  // platform-created owner plus someone later given their own OWNER_ADMIN
  // login), not just the first one created.
  const owners = await prisma.owner.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { units: true, users: true } },
      users: { where: { role: "OWNER_ADMIN", active: true }, select: { username: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const shaped = owners.map(({ users, ...o }) => ({ ...o, adminUsernames: users.map((u) => u.username) }));
  return NextResponse.json(shaped);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requirePlatformAdmin();
  if (error) return error;

  const parsed = parseOrError(createOwnerSchema, await req.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (await findDuplicateBusinessName(body.businessName)) {
    return NextResponse.json({ error: "A staycation with this business name already exists." }, { status: 409 });
  }

  const slug = await uniqueValue(slugify(body.businessName), async (s) => !!(await prisma.owner.findUnique({ where: { slug: s }, select: { id: true } })));
  const username = await uniqueValue(slugify(body.ownerName), async (u) => !!(await prisma.user.findUnique({ where: { username: u }, select: { id: true } })));

  // A fixed, known default rather than a randomly generated one — this
  // foundational pass has no email-invitation system yet (see the
  // multi-owner brief's staff-invitation section, deferred), so the
  // Platform Admin hands this off to the new owner directly, verbally or
  // however's convenient, without needing to relay a random string.
  // mustChangePassword forces them off it and onto their own real password
  // the moment they first sign in — this is the one thing standing between
  // "known default" and "real risk," so it's enforced server-side (not just
  // a UI redirect) via auth.ts's authorize()/session callbacks.
  const tempPassword = DEFAULT_NEW_OWNER_PASSWORD;
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  try {
    const owner = await prisma.owner.create({
      data: {
        businessName: body.businessName,
        slug,
        primaryColor: body.primaryColor || null,
        logoUrl: body.logoUrl || null,
        enabledModules: body.enabledModules !== undefined ? (body.enabledModules === null ? null : JSON.stringify(body.enabledModules)) : JSON.stringify(DEFAULT_NEW_OWNER_MODULES),
        // Every owner gets their own Settings row from the moment they
        // exist — the lazy upsert every other read site falls back to
        // would otherwise seed the wrong default businessName ("Evangelina's
        // Staycation", Settings.businessName's schema default) until they
        // happened to open Admin -> Settings themselves.
        settings: { create: { businessName: body.businessName } },
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
    // OWNER_ADMIN now also gets a linked Employee record (see
    // ensureEmployeeForUser's doc comment) — without it, this brand-new
    // owner's own admin account would hit the exact "Booker field renders
    // blank" bug reported live on The Felian, from the very first login.
    await ensureEmployeeForUser(ownerUser);
    await logAudit(user.id, "platform.owner.create", "Owner", owner.id, { businessName: owner.businessName, slug: owner.slug, ownerUserId: ownerUser.id });
    return NextResponse.json({ owner, login: { username, tempPassword } }, { status: 201 });
  } catch (e: any) {
    if (isUniqueConstraintError(e)) return NextResponse.json({ error: "That business name or owner name is already taken." }, { status: 409 });
    throw e;
  }
}
