import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

// The real 5 physical units of the business — not demo data.
const UNIT_DEFS = [
  { name: "Evangelina’s Comfort Stay", unitNumber: "1118", shortName: "Comfort Stay" },
  { name: "Evangelina’s Cozy City Stay", unitNumber: "1558", shortName: "Cozy City Stay" },
  { name: "Relax at Evangelina’s Stay", unitNumber: "1116", shortName: "Relax Stay" },
  { name: "Evangelina’s Signature Suites", unitNumber: "2045", shortName: "Signature Suites" },
  { name: "Unwind @ Evangelina’s Haven", unitNumber: "1845", shortName: "Haven" },
];

function randomPassword() {
  return crypto.randomBytes(9).toString("base64url"); // 12 chars, url-safe
}

async function main() {
  console.log("Seeding clean production state…");

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, businessName: "Evangelina's Staycation", address: "Cubao, Quezon City", nightlyRate: 1799, dpFee: 500 },
  });

  for (const [i, u] of UNIT_DEFS.entries()) {
    const unit = await prisma.unit.upsert({
      where: { id: `unit-${i}` },
      update: {},
      create: { id: `unit-${i}`, ...u, location: "Cubao, Araneta City", nightlyRate: 1799, rating: 4.85, sortOrder: i },
    });
    await prisma.housekeepingUnitState.upsert({
      where: { unitId: unit.id },
      update: {},
      create: { unitId: unit.id, status: "todo", checked: [] as any },
    });
  }

  const tempPassword = randomPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: "owner@evangelinas.ph" },
    update: {},
    create: {
      email: "owner@evangelinas.ph",
      username: "owner",
      name: "Evangelina Santos",
      role: "OWNER_ADMIN",
      passwordHash,
      mustChangePassword: true,
    },
  });
  await prisma.employee.upsert({ where: { userId: admin.id }, update: {}, create: { name: admin.name, role: "OWNER_ADMIN", userId: admin.id } });

  await prisma.auditLog.create({ data: { actorUserId: admin.id, action: "system.fresh_start", entity: "System", meta: { units: UNIT_DEFS.length } as any } });

  console.log("\nClean production state ready.");
  console.log(`  Admin login: ${admin.email} / username: ${admin.username}`);
  console.log(`  Temp password: ${tempPassword}`);
  console.log("  (mustChangePassword=true — you'll be forced to set your own password on first login)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
