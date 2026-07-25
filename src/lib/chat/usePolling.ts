"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `fetcher` immediately, then every `intervalMs` — the "no WebSocket
 * infra on serverless" tradeoff this whole module accepts (see chat build
 * notes). Each tick aborts the previous in-flight request before starting
 * a new one, same discipline as the Dashboard AI-insight fix earlier this
 * session: a slow poll response must never land after a newer one and
 * show stale data.
 *
 * Deliberately does NOT pause on document.visibilityState — that fires
 * "hidden" the moment a window merely loses OS focus (switching to another
 * app, or a second monitor with the chat window not currently clicked
 * into), not just when a tab is truly backgrounded/closed. A chat app
 * silently going quiet the moment someone alt-tabs to reply to an email is
 * exactly the failure mode a "presence-aware" tool can't have — confirmed
 * this the hard way in testing (two real windows open side by side, the
 * unfocused one stopped receiving new messages entirely). The interval
 * itself is cheap enough at this app's real staff count that pausing it
 * isn't worth that risk.
 */
export function usePolling(fetcher: (signal: AbortSignal) => Promise<void>, intervalMs: number, deps: React.DependencyList) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function tick() {
      controller?.abort();
      controller = new AbortController();
      try {
        await fetcherRef.current(controller.signal);
      } catch {
        // AbortError or a transient network hiccup — the next tick retries.
      }
    }

    tick();
    const id = setInterval(() => { if (!cancelled) tick(); }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
      controller?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
