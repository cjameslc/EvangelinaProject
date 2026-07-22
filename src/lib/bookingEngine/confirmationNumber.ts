import { prisma } from "@/lib/prisma";

// Uppercase alphanumeric, excluding visually-ambiguous characters (0/O, 1/I/L)
// since guests type this by hand for confirmation-number login.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** "EVA-7K2M9X" style code. Collision-checked against the unique DB constraint — practically never collides at this length, but never trust that blindly. */
export async function generateConfirmationNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `EVA-${randomCode(6)}`;
    const existing = await prisma.booking.findUnique({ where: { confirmationNumber: code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique confirmation number.");
}
