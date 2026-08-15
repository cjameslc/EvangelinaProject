"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { ColorThemeProvider } from "@/components/ui/ColorThemeProvider";
import { AvatarProvider } from "@/components/profile/AvatarProvider";
import { ViewModeProvider } from "@/components/layout/ViewModeProvider";
import { SeasonalSkinProvider } from "@/components/skins/SeasonalSkinProvider";
import type { SkinId } from "@/lib/skins/types";

// skinId defaults to the permanent default skin — the /login route has its
// own nested layout that renders a second <Providers> around just itself
// (see src/app/login/layout.tsx) without the root layout's server-resolved
// value in hand; a plain login screen doesn't need seasonal treatment
// anyway, so falling back here is the right call, not a gap to fill.
export function Providers({ skinId = "evangelina", children }: { skinId?: SkinId; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AvatarProvider>
        <ViewModeProvider>
          <ThemeProvider>
            <ColorThemeProvider>
              <SeasonalSkinProvider skinId={skinId}>
                <ToastProvider>{children}</ToastProvider>
              </SeasonalSkinProvider>
            </ColorThemeProvider>
          </ThemeProvider>
        </ViewModeProvider>
      </AvatarProvider>
    </SessionProvider>
  );
}
