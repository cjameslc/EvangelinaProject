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

    // A page's very first load is never itself SW-controlled — clients.claim()
    // in sw.js's activate handler still fires "controllerchange" once that
    // first install finishes, which is NOT an update, just normal first-visit
    // setup. Reloading on it force-refreshes every single first-time visitor
    // shortly after page load, potentially interrupting whatever they were
    // doing (typing, submitting a form). Only a real update — an existing
    // controller being replaced by a new one — should trigger a reload.
    const hadControllerBefore = !!navigator.serviceWorker.controller;
    let refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed || !hadControllerBefore) return;
      refreshed = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
