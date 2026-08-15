import { prisma } from "@/lib/prisma";

// Uppercase alphanumeric, excluding visually-ambiguous characters (0/O, 1/I/L)
// since guests type this by hand for confirmation-number login.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/**
 * "EVA-7K2M9X" style code. Collision-checked against the unique DB
 * constraint (globally, across every owner — see the b/[cn] short-link and
 * confirmation-number guest login, which both rely on this being globally
 * unique regardless of prefix) — practically never collides at this
 * length, but never trust that blindly.
 *
 * The 3-letter prefix is derived from the booked unit's own owner (its
 * slug's first letters, uppercased) rather than always "EVA" — otherwise
 * every other owner's guests would get a confirmation number branded as
 * Evangelina's, which reads as a real mistake once you're staring at your
 * own booking. Falls back to "EVA" only if the unit/owner lookup somehow
 * comes back empty (should never happen for a real booking).
 */
export async function generateConfirmationNumber(unitId: string): Promise<string> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { owner: { select: { slug: true } } } });
  const rawPrefix = unit?.owner?.slug.replace(/-/g, "").slice(0, 3).toUpperCase();
  const prefix = rawPrefix && rawPrefix.length === 3 ? rawPrefix : "EVA";

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `${prefix}-${randomCode(6)}`;
    const existing = await prisma.booking.findUnique({ where: { confirmationNumber: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique confirmation number.");
}
