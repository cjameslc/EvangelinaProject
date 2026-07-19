"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// The profile photo itself never goes through NextAuth's session/JWT (that's
// a cookie — a data-URL photo would blow its size limit). Instead this
// fetches it once, separately, from /api/profile, and holds it in a small
// context so the Navbar (mounted once in the root layout, outside the
// per-page Profile component) can show the same photo and get it updated
// live the moment ProfileView saves a new one, without a full reload.
type AvatarCtx = { avatarUrl: string | null; setAvatarUrl: (url: string | null) => void };
const Ctx = createContext<AvatarCtx>({ avatarUrl: null, setAvatarUrl: () => {} });

export function AvatarProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setAvatarUrl(data.avatarUrl ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status]);

  return <Ctx.Provider value={{ avatarUrl, setAvatarUrl }}>{children}</Ctx.Provider>;
}

export function useAvatar() {
  return useContext(Ctx);
}
