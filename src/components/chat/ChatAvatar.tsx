"use client";

import { initials } from "@/lib/format";

/** Same avatarUrl/avatarColor + initials-fallback pattern the Navbar
 * already uses for the signed-in user's own avatar, generalized to any
 * staff member so chat can show everyone's real avatar consistently. */
export function ChatAvatar({ name, avatarUrl, avatarColor, size = 34 }: { name: string; avatarUrl: string | null; avatarColor: string; size?: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="flex-none rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: avatarColor || "#FF385C", fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}
