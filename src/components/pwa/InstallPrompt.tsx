"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";

const DISMISSED_KEY = "pwa-install-dismissed";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "1" || isInStandaloneMode()) return;
    setDismissed(false);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — there's no programmatic
    // install API there, only the manual Share -> Add to Home Screen flow.
    if (isIos()) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[420px] rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3.5 shadow-card md:bottom-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 flex-none rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold text-[var(--ink)]">Install Evangelina&rsquo;s Staycation</p>
          <p className="mt-0.5 text-[12px] text-[var(--gray)]">
            {showIosHint
              ? "Tap the Share icon, then “Add to Home Screen”."
              : "Add it to your home screen for quick, full-screen access."}
          </p>
          {!showIosHint && (
            <button onClick={install} className="btn-primary btn-sm mt-2">Install</button>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="btn-icon -mr-1 -mt-1 flex-none">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
