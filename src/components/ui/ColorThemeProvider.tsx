"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { isColorThemeId, type ColorThemeId } from "@/lib/colorThemes";

const STORAGE_KEY = "ev_color_theme";

type ColorThemeCtx = { colorTheme: ColorThemeId | null; setColorTheme: (id: ColorThemeId | null) => void; saving: boolean };
const Ctx = createContext<ColorThemeCtx>({ colorTheme: null, setColorTheme: () => {}, saving: false });

function applyToDom(id: ColorThemeId | null) {
  if (id) document.documentElement.setAttribute("data-color-theme", id);
  else document.documentElement.removeAttribute("data-color-theme");
}

/**
 * A personal color theme (see src/lib/colorThemes.ts) is a per-account
 * preference (User.colorTheme) — unlike the Seasonal Skin System (one
 * Admin-controlled setting every visitor sees identically, resolved
 * server-side in the root layout), this only ever applies to a signed-in
 * staff member's own screen, applied client-side here, same reasoning
 * ThemeProvider's light/dark toggle already uses (reading the session in
 * the root layout once broke static rendering for the guest site — see
 * that file's own comment).
 *
 * localStorage gives instant, flash-free apply on every load (same
 * mechanism as "ev_theme"); the account's own saved value (session.user.
 * colorTheme) is the actual source of truth and reconciles localStorage
 * once the session resolves — so switching devices, or signing in as a
 * different person on the same browser, converges on the right theme
 * rather than leaking the previous session's local preference.
 */
export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const [colorTheme, setColorThemeState] = useState<ColorThemeId | null>(null);
  const [saving, setSaving] = useState(false);

  // Instant, pre-session apply from localStorage — avoids a flash of the
  // default palette while the session is still loading.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isColorThemeId(stored)) {
      setColorThemeState(stored);
      applyToDom(stored);
    }
  }, []);

  // Once the real session is known, it wins — a guest (no session) never
  // gets a theme applied at all; a signed-in account's own saved value
  // (possibly set on a different device) overrides whatever local guess
  // was applied above.
  useEffect(() => {
    if (status !== "authenticated") {
      if (status === "unauthenticated") { setColorThemeState(null); applyToDom(null); }
      return;
    }
    const accountValue = isColorThemeId(session.user.colorTheme) ? session.user.colorTheme : null;
    setColorThemeState(accountValue);
    applyToDom(accountValue);
    if (accountValue) localStorage.setItem(STORAGE_KEY, accountValue);
    else localStorage.removeItem(STORAGE_KEY);
  }, [status, session?.user?.colorTheme]);

  const setColorTheme = useCallback(
    (id: ColorThemeId | null) => {
      // Instant switch — apply immediately, persist to the account in the
      // background. A failed save reverts (rare: network/session issue).
      const previous = colorTheme;
      setColorThemeState(id);
      applyToDom(id);
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
      if (status !== "authenticated") return;
      setSaving(true);
      fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colorTheme: id }) })
        .then((res) => { if (!res.ok) throw new Error(); return update({ colorTheme: id }); })
        .catch(() => {
          setColorThemeState(previous);
          applyToDom(previous);
          if (previous) localStorage.setItem(STORAGE_KEY, previous);
          else localStorage.removeItem(STORAGE_KEY);
        })
        .finally(() => setSaving(false));
    },
    [colorTheme, status, update]
  );

  const value = useMemo(() => ({ colorTheme, setColorTheme, saving }), [colorTheme, setColorTheme, saving]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useColorTheme() {
  return useContext(Ctx);
}
