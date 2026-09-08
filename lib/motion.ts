"use client";

import { useEffect, useState } from "react";

/**
 * A whole-app primitive (moved out of components/marketing per docs/decisions/0057's
 * app-wide motion vocabulary -- this hook now backs authenticated-product motion, not
 * just the public marketing page).
 *
 * Defaults to `true` (reduced) until the real media query resolves on the client --
 * every consumer must therefore treat "reduced" as the safe baseline render (fully static,
 * fully visible), never a stripped-down one. This means a server-rendered/pre-hydration
 * paint never shows motion that a reduced-motion visitor didn't ask for, at the cost of a
 * one-frame delay before a motion-tolerant visitor's animation starts.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/**
 * Counts up from 0 to a real, already-known integer value on mount -- the cockpit
 * reskin's "metric count-up" micro-interaction (docs/decisions/0061), used only on a
 * stat display whose final value is already resolved (never a loading placeholder, a
 * zero, or a mock number rendered as if it were live -- DESIGN.md's "never animate a
 * placeholder" rule applies here exactly as it does to the donut chart's reveal). Runs
 * once per mount (a changed `value` restarts it, matching how a real stat refresh should
 * read), 700ms ease-out via `requestAnimationFrame` so it stays a single rAF loop rather
 * than N `setInterval` timers across a page with many stat tiles. `usePrefersReducedMotion`
 * short-circuits straight to the final value with no intermediate frames at all.
 */
export function useCountUp(value: number, durationMs = 700): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let frame: number;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - elapsed) ** 3;
      setDisplay(Math.round(eased * value));
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, durationMs]);

  return display;
}
