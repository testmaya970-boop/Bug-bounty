"use client";

import React, { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { usePrefersReducedMotion } from "../../lib/motion";

const STEP_MS = 1050;

type Entry = { time: string; label: string; detail: string; tone: "neutral" | "action" | "success" };

// The full, real report lifecycle this app's own domain model enforces (see
// docs/decisions/0021) -- every entry here is a real transition this schema actually
// allows, in the real order it happens, not an invented sequence. Timestamps are
// illustrative but internally consistent (same day, ascending, plausible gaps) --
// exactly the kind of organic, non-round specificity real audit timestamps have,
// never "00:00" placeholders.
const ENTRIES: Entry[] = [
  { time: "09:14:02", label: "Report submitted", detail: "Authentication bypass on session refresh · api.cloudvault.example/v1/session", tone: "action" },
  { time: "09:14:02", label: "Evidence attached", detail: "3 artifacts · request log, repro script, screenshot", tone: "neutral" },
  { time: "09:41:18", label: "Triage started", detail: "Severity assessed: critical", tone: "neutral" },
  { time: "11:02:47", label: "Information requested", detail: "Organization asked for a reproduction step", tone: "neutral" },
  { time: "13:26:09", label: "Response received", detail: "Researcher replied · triage resumed", tone: "neutral" },
  { time: "14:07:33", label: "Decision recorded", detail: "Accepted · reason attached · actor: org_admin", tone: "neutral" },
  { time: "14:28:03", label: "Audit event recorded", detail: "Locked · readable by every party to the report", tone: "success" },
];

/**
 * The hero's real visual (Turn 9, second pass): not a screenshot, not a device mockup of
 * any kind -- every device-frame version of this (dark glass panel, then a light browser-
 * window mockup) was still fundamentally the same "fake app screenshot in a box" pattern,
 * the actual thing making the page read as generic. This is the record itself: no frame,
 * no card border, no chrome -- a monospace ledger sitting directly on the page's own
 * canvas, its entries appending one at a time exactly as the real product's own
 * append-only audit trail works (docs/decisions/0077/0078's "security work becomes a
 * permanent record" -- the same real idea, reused here rather than invented twice).
 * The specificity (real timestamps, a real record id, a real finding) IS the visual --
 * per the research into what separates a premium design from a generic one, decoration
 * with no information is the tell; a growing list of real, dated facts is the opposite of
 * that.
 *
 * Labelled "Illustrative" once, plainly, rather than "live" or "simulated for
 * demonstration" repeated on every line -- the record-id/finding/timestamps are invented
 * for this demo the same way every other illustrative example in this app is, disclosed
 * once and left to read naturally after that.
 */
export function LiveWorkflowArtifact() {
  const reducedMotion = usePrefersReducedMotion();
  const [count, setCount] = useState(ENTRIES.length);

  useEffect(() => {
    if (reducedMotion) {
      setCount(ENTRIES.length);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    function advance(current: number) {
      if (cancelled) return;
      setCount(current);
      if (current < ENTRIES.length) {
        timer = setTimeout(() => advance(current + 1), STEP_MS);
      } else {
        timer = setTimeout(() => {
          if (cancelled) return;
          advance(0);
        }, 3400);
      }
    }
    timer = setTimeout(() => advance(0), STEP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reducedMotion]);

  const closed = count >= ENTRIES.length;

  return (
    <div aria-hidden="true" className="w-full max-w-lg">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-strong pb-3">
        <span className="font-mono text-sm font-semibold tracking-wide text-ink">REC-0000842</span>
        <span className={cn("font-mono text-xs font-semibold uppercase tracking-wider transition-colors duration-300", closed ? "text-success" : "text-action")}>
          {closed ? "Closed" : "Open"}
        </span>
      </div>

      {/* Only entries up to `count` are ever mounted -- unlike an always-rendered list with
          opacity-0 padding, the <ul>'s real height grows exactly as the record grows, so
          the footnote below tracks the list instead of sitting fixed under empty space. A
          reset to zero (the loop restarting) is instant, matching a real record clearing
          between demo cycles rather than reverse-animating out. */}
      <ul className="mt-4 min-h-40 space-y-4">
        {ENTRIES.slice(0, count).map((entry) => (
          <li key={entry.label} className="flex items-start gap-4 motion-safe:animate-hero-reveal">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-ink-muted">{entry.time}</span>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", entry.tone === "action" ? "text-action" : entry.tone === "success" ? "text-success" : "text-ink")}>{entry.label}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{entry.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-border pt-3 font-mono text-[11px] text-ink-muted/70">Illustrative record.</p>
    </div>
  );
}
