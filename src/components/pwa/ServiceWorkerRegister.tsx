"use client";

import { useEffect } from "react";

// Registers the service worker and applies updates automatically — no
// user-facing "update available" prompt. skipWaiting()+clients.claim() in
// sw.js mean a new SW takes control immediately; we just reload once that
// happens so the tab is running the new version.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
