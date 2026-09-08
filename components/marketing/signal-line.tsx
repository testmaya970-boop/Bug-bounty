import React from "react";
import { cn } from "../../lib/cn";

/**
 * Sentinel's one recurring graphic signature (see docs/decisions/0035): a thin teal rule
 * with a traveling pulse, styled identically everywhere it appears -- the hero, the
 * lifecycle section, the real-product section, and the final CTA. A visitor who saw one
 * of these fragments alone, without the wordmark, should recognize it as the same page.
 *
 * Pure CSS (`motion-safe:` variant + the `signal-travel` keyframe in app/globals.css) --
 * no JS, no dependency on `usePrefersReducedMotion`. Under `prefers-reduced-motion:
 * reduce` the pulse simply renders at its resting position with no animation applied;
 * `aria-hidden` throughout, since the line carries no information of its own.
 */
export function SignalLine({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative hidden w-px shrink-0 self-stretch bg-canvas/15 sm:block", className)}>
      <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-action motion-safe:animate-[signal-travel_4s_ease-in-out_infinite]" />
    </div>
  );
}
