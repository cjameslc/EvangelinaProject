"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const RETURN_PATH_KEY = "impersonation:returnPath";

/**
 * Client-side impersonation lifecycle. The actual identity swap happens
 * inside NextAuth's own jwt() callback (src/lib/auth.ts) via
 * useSession().update() — this hook just sequences the two steps (create
 * the server-validated ImpersonationSession row, then trigger the token
 * swap) and handles the "return to where the admin was" navigation.
 */
export function useImpersonation() {
  const { update } = useSession();
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  async function startImpersonation(targetUserId: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
    setStarting(true);
    try {
      const res = await fetch("/api/admin/impersonate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: j.error ?? "Couldn't start impersonation." };

      if (typeof window !== "undefined") sessionStorage.setItem(RETURN_PATH_KEY, window.location.pathname);
      await update({ __impersonate: { action: "start", sessionId: j.sessionId } });
      router.push("/");
      router.refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error — please try again." };
    } finally {
      setStarting(false);
    }
  }

  async function stopImpersonation() {
    setStopping(true);
    try {
      await update({ __impersonate: { action: "stop" } });
      const returnPath = typeof window !== "undefined" ? sessionStorage.getItem(RETURN_PATH_KEY) : null;
      if (typeof window !== "undefined") sessionStorage.removeItem(RETURN_PATH_KEY);
      router.push(returnPath || "/admin");
      router.refresh();
    } finally {
      setStopping(false);
    }
  }

  return { startImpersonation, stopImpersonation, starting, stopping };
}
