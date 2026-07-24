import { prisma } from "@/lib/prisma";

/** "LDY-000123" style — sequential (not random, unlike Booking's
 * confirmationNumber) since a laundry ticket is meant to be short and
 * easy to read off a physical tag/receipt, and naturally sorts by
 * creation order. Collision-checked the same defensive way anyway (two
 * near-simultaneous creates both reading the same "current max" before
 * either commits is possible on this app's non-locking transaction
 * pattern — see createBookingCore's own comment on the same tradeoff). */
export async function generateLaundryOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.laundryOrder.count();
    const candidate = `LDY-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await prisma.laundryOrder.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique laundry order number.");
}
