"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

// The profile photo (and display name) shouldn't be trusted from NextAuth's
// session/JWT — a data-URL photo would blow the cookie size limit, and the
// JWT's `name` is only ever refreshed when the signed-in user edits their
// OWN profile (see auth.ts's `trigger === "update"` handling). If an admin
// renames someone else via Admin -> Users & roles (or a one-off script), that
// person's already-open session keeps showing the stale old name until they
// log out and back in. So both are instead fetched once, fresh, from
// /api/profile, and held in a small context so the Navbar (mounted once in
// the root layout, outside the per-page Profile component) always shows the
// current DB value and gets updated live the moment ProfileView saves.
type AvatarCtx = { avatarUrl: string | null; setAvatarUrl: (url: string | null) => void; name: string | null; setName: (name: string | null) => void };
const Ctx = createContext<AvatarCtx>({ avatarUrl: null, setAvatarUrl: () => {}, name: null, setName: () => {} });

export function AvatarProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setAvatarUrl(null);
      setName(null);
      return;
    }
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAvatarUrl(data.avatarUrl ?? null);
        setName(data.name ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status]);

  return <Ctx.Provider value={{ avatarUrl, setAvatarUrl, name, setName }}>{children}</Ctx.Provider>;
}

export function useAvatar() {
  return useContext(Ctx);
}
