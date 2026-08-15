"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Client-side multi-staycation switch — same two-step shape as
 * useImpersonation() in src/lib/impersonation.ts: a server-validated POST
 * first, then the actual token swap via useSession().update() (see the
 * jwt() callback in src/lib/auth.ts). Unlike impersonation, this never
 * navigates away — the whole point is switching properties without losing
 * your place, so it refreshes the current route in place instead of
 * pushing to "/".
 */
export function useStaycationSwitch() {
  const { update } = useSession();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function switchStaycation(ownerId: string): Promise<{ ok: boolean; error?: string }> {
    setSwitching(true);
    try {
      const res = await fetch("/api/staycations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error ?? "Couldn't switch staycations." };

      await update({ __switchOwner: { ownerId } });
      router.refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error — please try again." };
    } finally {
      setSwitching(false);
    }
  }

  return { switchStaycation, switching };
}
