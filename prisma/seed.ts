import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const UNIT_DEFS = [
  { name: "Evangelina’s Comfort Stay", unitNumber: "1118", shortName: "Comfort Stay" },
  { name: "Evangelina’s Cozy City Stay", unitNumber: "1558", shortName: "Cozy City Stay" },
  { name: "Relax at Evangelina’s Stay", unitNumber: "1116", shortName: "Relax Stay" },
  { name: "Evangelina’s Signature Suites", unitNumber: "2045", shortName: "Signature Suites" },
  { name: "Unwind @ Evangelina’s Haven", unitNumber: "1845", shortName: "Haven" },
];

const DEFAULT_STOCK: [string, number][] = [
  ["Tissue rolls", 4], ["Bath towels", 6], ["Bottled water", 8],
  ["Toiletry kits", 5], ["Trash bags", 10], ["Coffee/creamer sachets", 12],
];

const BILL_DEFAULT_DUE: Record<string, number> = { assoc: 3500, water: 1800, elec: 6200, net: 1799, stream: 549 };

function daysAgo(n: number, h = 10, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding Evangelina's Staycation…");

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, businessName: "Evangelina's Staycation", address: "Cubao, Quezon City", nightlyRate: 1799, dpFee: 500 },
  });

  // ── Units ──
  const units = [];
  for (const [i, u] of UNIT_DEFS.entries()) {
    const unit = await prisma.unit.upsert({
      where: { id: `seed-unit-${i}` },
      update: {},
      create: { id: `seed-unit-${i}`, ...u, location: "Cubao, Araneta City", nightlyRate: 1799, rating: 4.85 + i * 0.02, sortOrder: i },
    });
    units.push(unit);
    for (const [name, count] of DEFAULT_STOCK) {
      await prisma.stock.upsert({
        where: { id: `${unit.id}-${name}` },
        update: {},
        create: { id: `${unit.id}-${name}`, unitId: unit.id, name, count },
      });
    }
    await prisma.housekeepingUnitState.upsert({
      where: { unitId: unit.id },
      update: {},
      create: { unitId: unit.id, status: "todo", checked: [] },
    });
  }

  // ── Password: all demo accounts use "password123" ──
  const passwordHash = await bcrypt.hash("password123", 10);

  async function upsertUser(email: string, name: string, role: Role) {
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role, passwordHash },
    });
  }

  const owner = await upsertUser("owner@evangelinas.ph", "Evangelina Santos", "OWNER_ADMIN");
  const coOwner = await upsertUser("coowner@evangelinas.ph", "Marco Dizon", "CO_OWNER");
  const housekeeper = await upsertUser("housekeeping@evangelinas.ph", "Justine Oliva", "HOUSEKEEPING");
  const booker = await upsertUser("booker@evangelinas.ph", "Riemar Ligad", "BOOKER");
  const auditor = await upsertUser("auditor@evangelinas.ph", "Carla Mendoza", "AUDITOR");
  const housekeeper2Name = "Christian Elesario";

  // Co-owner is scoped to the first two units.
  for (const unit of units.slice(0, 2)) {
    await prisma.unitOwner.upsert({
      where: { userId_unitId: { userId: coOwner.id, unitId: unit.id } },
      update: {},
      create: { userId: coOwner.id, unitId: unit.id },
    });
  }

  // ── Staff directory (fills Booker / Cleaner / Received-by pickers) ──
  const empOwner = await prisma.employee.upsert({ where: { userId: owner.id }, update: {}, create: { name: owner.name, role: "OWNER_ADMIN", userId: owner.id } });
  const empBooker = await prisma.employee.upsert({ where: { userId: booker.id }, update: {}, create: { name: booker.name, role: "BOOKER", userId: booker.id, payRateNote: "₱100/book + ₱1,000/wk + ₱299 boost" } });
  const empHk1 = await prisma.employee.upsert({ where: { userId: housekeeper.id }, update: {}, create: { name: housekeeper.name, role: "HOUSEKEEPING", userId: housekeeper.id, payRateNote: "₱700/day + ₱300 per extra clean" } });
  const empHk2 = await prisma.employee.create({ data: { name: housekeeper2Name, role: "HOUSEKEEPING", payRateNote: "₱300 per night clean" } });

  // ── Sample bookings across the last 2 weeks ──
  const platforms = ["Airbnb", "Facebook", "TikTok", "Other"] as const;
  const stayTypes = ["Daycation", "Night", "Full"] as const;
  const guestNames = ["Dela Cruz family", "Bautista", "Garcia", "A. Reyes", "Pascual", "Morales", "Ramos couple", "Cruz", "Domingo", "Santos family", "Tan", "Villanueva"];

  for (let i = 0; i < 18; i++) {
    const unit = units[i % units.length];
    const stayType = stayTypes[i % stayTypes.length];
    const platform = platforms[i % platforms.length];
    const paid = i % 3 !== 0;
    const amount = stayType === "Full" ? 1799 : stayType === "Night" ? 999 : 799;
    const date = daysAgo(14 - i);
    const booking = await prisma.booking.upsert({
      where: { id: `seed-booking-${i}` },
      update: {},
      create: {
        id: `seed-booking-${i}`,
        unitId: unit.id,
        date,
        stayType,
        guests: [guestNames[i % guestNames.length]],
        pax: 2 + (i % 3),
        contactNumber: `0917${(1000000 + i * 137).toString().slice(0, 7)}`,
        bookerId: empBooker.id,
        cleanerId: i % 2 === 0 ? empHk1.id : empHk2.id,
        platform,
        dpAmount: 500,
        dpReceivedById: empBooker.id,
        dpMethod: "GCash",
        amount,
        receivedById: i % 2 === 0 ? empBooker.id : empOwner.id,
        method: i % 2 === 0 ? "GCash" : "Cash",
        paid,
      },
    });
    await prisma.calendarBlock.upsert({
      where: { id: `seed-cal-${i}` },
      update: {},
      create: { id: `seed-cal-${i}`, unitId: unit.id, type: stayType, date, guest: booking.guests.join(", "), status: "confirmed" },
    });
  }

  // A couple of cleaning / maintenance blocks so the calendar isn't only bookings.
  await prisma.calendarBlock.upsert({ where: { id: "seed-cal-clean-1" }, update: {}, create: { id: "seed-cal-clean-1", unitId: units[0].id, type: "Cleaning", date: daysAgo(1) } });
  await prisma.calendarBlock.upsert({ where: { id: "seed-cal-maint-1" }, update: {}, create: { id: "seed-cal-maint-1", unitId: units[3].id, type: "Maintenance", date: daysAgo(2), endDate: daysAgo(1), note: "Aircon servicing" } });

  // ── Housekeeping demo state ──
  await prisma.housekeepingUnitState.update({ where: { unitId: units[0].id }, data: { status: "clean", byName: empHk1.name, startedAt: daysAgo(0, 9, 10), endedAt: daysAgo(0, 9, 52), checked: [] } });
  await prisma.housekeepingUnitState.update({ where: { unitId: units[2].id }, data: { status: "cleaning", byName: empHk1.name, startedAt: new Date(Date.now() - 22 * 60000), checked: [] } });
  await prisma.housekeepingUnitState.update({ where: { unitId: units[4].id }, data: { status: "clean", byName: empHk2.name, startedAt: daysAgo(1, 14, 0), endedAt: daysAgo(1, 14, 45), checked: [] } });

  const cleaningLogSeeds = [
    { unit: units[0], emp: empHk1, start: daysAgo(0, 9, 10), end: daysAgo(0, 9, 52) },
    { unit: units[1], emp: empHk1, start: daysAgo(0, 11, 0), end: daysAgo(0, 11, 38) },
    { unit: units[4], emp: empHk2, start: daysAgo(1, 14, 0), end: daysAgo(1, 14, 45) },
    { unit: units[2], emp: empHk1, start: daysAgo(1, 10, 0), end: daysAgo(1, 10, 41) },
    { unit: units[3], emp: empHk2, start: daysAgo(2, 13, 0), end: daysAgo(2, 13, 50) },
    { unit: units[0], emp: empHk1, start: daysAgo(3, 9, 0), end: daysAgo(3, 9, 44) },
    { unit: units[1], emp: empHk2, start: daysAgo(5, 15, 0), end: daysAgo(5, 15, 39) },
  ];
  for (const l of cleaningLogSeeds) {
    await prisma.cleaningLog.create({ data: { unitId: l.unit.id, employeeId: l.emp.id, startedAt: l.start, endedAt: l.end } });
  }

  // Tweak a couple of stock levels so the "low stock" UI has something to show.
  await prisma.stock.updateMany({ where: { unitId: units[0].id, name: "Tissue rolls" }, data: { count: 1 } });
  await prisma.stock.updateMany({ where: { unitId: units[4].id, name: "Bottled water" }, data: { count: 0 } });

  // ── Bills for the current month ──
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  for (const unit of units) {
    for (const [key, due] of Object.entries(BILL_DEFAULT_DUE)) {
      const existing = await prisma.bill.findFirst({ where: { unitId: unit.id, key: key as any, month } });
      if (!existing) {
        await prisma.bill.create({ data: { unitId: unit.id, key: key as any, month, amountDue: due, paid: Math.random() > 0.6 } });
      }
    }
  }

  await prisma.auditLog.create({ data: { actorUserId: owner.id, action: "seed.completed", entity: "System", meta: { units: units.length } } });

  console.log("Seed complete. Demo accounts (password: password123):");
  console.log(`  Owner/Admin  -> ${owner.email}`);
  console.log(`  Co-owner     -> ${coOwner.email}`);
  console.log(`  Housekeeping -> ${housekeeper.email}`);
  console.log(`  Booker       -> ${booker.email}`);
  console.log(`  Auditor      -> ${auditor.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
