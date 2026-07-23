"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import type { ComponentProps, MouseEvent } from "react";

type Props = ComponentProps<typeof Link>;

/**
 * A same-window Next.js Link that opens its destination with the browser's
 * native View Transitions API (a smooth cross-fade/scale — see the
 * ::view-transition-* rules in globals.css) instead of an abrupt swap.
 * Falls back to a completely normal Link click (instant navigation, no
 * animation) on any browser without support — Safari/Firefox as of this
 * writing — so nothing ever breaks, it just isn't animated there.
 *
 * flushSync is required here: startViewTransition needs the DOM mutation
 * to happen synchronously inside its callback so it can snapshot the
 * "after" state before painting; router.push on its own updates state
 * asynchronously, which the transition would otherwise miss entirely.
 */
export function TransitionLink({ href, onClick, ...rest }: Props) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Let modified clicks (open in new tab, etc.) behave completely normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (typeof document === "undefined" || !("startViewTransition" in document)) return;

    e.preventDefault();
    document.startViewTransition(() => {
      flushSync(() => {
        router.push(href.toString());
      });
    });
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
