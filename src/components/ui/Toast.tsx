"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ToastState = { msg: string; bad?: boolean; show: boolean };
const Ctx = createContext<(msg: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ToastState>({ msg: "", show: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((msg: string, bad?: boolean) => {
    setState({ msg, bad, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, show: false })), bad ? 3200 : 2000);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div
        className={cn(
          "fixed left-1/2 bottom-6 z-[90] max-w-[90vw] -translate-x-1/2 rounded-full px-5 py-3 text-center text-sm font-bold text-white shadow-card transition-all duration-200",
          state.bad ? "bg-rausch" : "bg-[var(--ink)] dark:text-[var(--bg)]",
          state.show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-5 opacity-0",
          // A soft success glow (not for errors — a warning should never
          // look celebratory) reusing the existing glow-pulse keyframe
          // rather than a bespoke toast animation.
          state.show && !state.bad && "animate-glow-pulse"
        )}
      >
        {state.msg}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
