"use client";

import { createContext, useContext, useMemo } from "react";
import { getSkin } from "@/lib/skins/config";
import type { SkinConfig, SkinId } from "@/lib/skins/types";

const Ctx = createContext<SkinConfig>(getSkin("evangelina"));

/**
 * Every page reads the active skin from here — never its own theme logic
 * (brief section 13). `skinId` is resolved server-side (see
 * getCachedActiveSkinId) and passed in as a prop from the root layout,
 * which also sets `data-skin={skinId}` directly on <html> so the CSS-token
 * overrides in globals.css ([data-skin="christmas"] etc.) apply with zero
 * client-side flash — unlike light/dark (a personal, localStorage-backed
 * preference), the skin is a business-wide setting every visitor sees
 * identically, so it belongs in the initial server render, not client
 * state. This provider's only job is making the *messaging/colors/
 * confetti config* for the already-resolved skin available to components
 * without prop-drilling; it does not itself decide which skin is active.
 */
export function SeasonalSkinProvider({ skinId, children }: { skinId: SkinId; children: React.ReactNode }) {
  const skin = useMemo(() => getSkin(skinId), [skinId]);
  return <Ctx.Provider value={skin}>{children}</Ctx.Provider>;
}

export function useSeasonalSkin(): SkinConfig {
  return useContext(Ctx);
}
