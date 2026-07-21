"use client";

import { useEffect } from "react";
import { attachOfflineQueueListeners } from "@/lib/offlineQueue";

// Registers the service worker and applies updates automatically — no
// user-facing "update available" prompt. skipWaiting()+clients.claim() in
// sw.js mean a new SW takes control immediately; we just reload once that
// happens so the tab is running the new version. Also attaches the offline
// mutation queue's online/visibility listeners once, app-wide.
export function ServiceWorkerRegister() {
  useEffect(() => {
    attachOfflineQueueListeners();

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
