"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { usePrefersReducedMotion } from "../../lib/motion";

export type LifecycleStage = { key: string; label: string; artifact: React.ReactNode };

/**
 * A real, clickable button group -- not scroll-jacking. Scroll-jacking was considered and
 * deliberately rejected: it is fragile across trackpads/wheels, and it routinely breaks
 * keyboard and screen-reader navigation, which this page cannot afford to break. Autoplay
 * (paused on hover/focus) gives the "alive" feeling the brief asks for; every stage is a
 * real, independently focusable, independently clickable button, so nothing here depends
 * on animation to be reachable. Plain buttons with `aria-pressed`, not `role="tab"` --
 * the ARIA tab pattern implies roving-tabindex arrow-key navigation this component does
 * not implement, and claiming that role without it would be a worse accessibility bug
 * than not claiming it.
 */
export function LifecycleStepper({
  stages,
  autoAdvanceMs = 2600,
  compact = false,
}: {
  stages: LifecycleStage[];
  autoAdvanceMs?: number;
  compact?: boolean;
}) {
  const [active, setActive] = useState(0);
  const pausedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Autoplay is motion; a reduced-motion visitor still gets every stage, just only by
    // their own click, never automatically.
    if (reducedMotion) return;
    const id = setInterval(() => {
      if (!pausedRef.current) setActive((current) => (current + 1) % stages.length);
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [autoAdvanceMs, reducedMotion, stages.length]);

  return (
    <div onMouseEnter={() => (pausedRef.current = true)} onMouseLeave={() => (pausedRef.current = false)} onFocus={() => (pausedRef.current = true)} onBlur={() => (pausedRef.current = false)}>
      <div role="group" aria-label="Security workflow stages" className={cn("flex gap-2 overflow-x-auto pb-1", compact ? "flex-wrap" : "flex-wrap sm:flex-nowrap")}>
        {stages.map((stage, index) => (
          <button
            key={stage.key}
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              active === index ? "border-action bg-action/10 text-action" : "border-border text-ink-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span className="mr-1.5 font-mono text-[10px] font-normal text-ink-muted/70">{String(index + 1).padStart(2, "0")}</span>
            {stage.label}
          </button>
        ))}
      </div>
      <div className="relative mt-6 min-h-40">
        {stages.map((stage, index) => (
          <div
            key={stage.key}
            aria-hidden={active !== index}
            className={cn("transition-opacity duration-300", active === index ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0")}
          >
            {stage.artifact}
          </div>
        ))}
      </div>
    </div>
  );
}
