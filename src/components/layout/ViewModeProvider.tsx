"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { VIEW_MODE_COOKIE, readViewModeCookie, type ViewMode } from "@/lib/viewModeCookie";

// Used to live server-side (getViewMode() in viewMode.ts, read in the root
// layout and passed down as a prop) — but a cookies() read anywhere in a
// shared layout opts Next.js's ENTIRE route tree into forced per-request
// dynamic rendering, blocking any caching at all on every single page in
// the app, including fully public/unauthenticated ones with no other
// reason to be dynamic. A real, confirmed Fast Origin Transfer cost.
//
// "staff" for the very first render (matches getViewMode()'s own default
// when the cookie is absent, so the overwhelming majority of users — the
// cookie is only ever set by someone deliberately toggling Travel Mode —
// see zero change), corrected after mount if the cookie says otherwise.
// Travel Mode is itself a staff-only preview toggle (see Navbar.tsx's
// isStaffNav — an anonymous guest's nav is already governed by `!session`,
// not this cookie), so the brief post-mount correction for someone who HAS
// toggled it is a small, disclosed, staff-only UX cost, not a guest-facing
// correctness issue. src/app/page.tsx's own getViewMode() call (deciding
// whether "/" redirects a staff session to /dashboard) is untouched — it's
// already downstream of getCurrentUser()'s own cookie read, so it was
// never actually saving anything by also reading this cookie server-side.
type ViewModeCtx = { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void };
const Ctx = createContext<ViewModeCtx>({ viewMode: "staff", setViewMode: () => {} });

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>("staff");

  useEffect(() => {
    setViewModeState(readViewModeCookie());
  }, []);

  function setViewMode(mode: ViewMode) {
    document.cookie = `${VIEW_MODE_COOKIE}=${mode}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setViewModeState(mode);
  }

  const value = useMemo(() => ({ viewMode, setViewMode }), [viewMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewMode() {
  return useContext(Ctx);
}
