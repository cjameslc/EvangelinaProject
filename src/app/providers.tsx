"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import { AvatarProvider } from "@/components/profile/AvatarProvider";
import { ViewModeProvider } from "@/components/layout/ViewModeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AvatarProvider>
        <ViewModeProvider>
          <ThemeProvider>
            <ToastProvider>{children}</ToastProvider>
          </ThemeProvider>
        </ViewModeProvider>
      </AvatarProvider>
    </SessionProvider>
  );
}
