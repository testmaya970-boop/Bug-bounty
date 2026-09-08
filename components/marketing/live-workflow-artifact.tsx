"use client";

import React, { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { MetadataPair, SectionLabel } from "../ui/security-primitives";
import { SeverityBadge, StatusBadge } from "../ui/badge";
import { usePrefersReducedMotion } from "../../lib/motion";

const LAST_PHASE = 9;
const STEP_MS = 950;
const HOLD_MS = 3200;
const FADE_MS = 350;

// The same two report titles RealProductFragment's other rows use (see docs/decisions/
// 0036) -- deliberate continuity: this hero shows the exact report that section 05's
// "real product" fragment later shows already resolved, and the same two "noise" reports
// sitting quietly in both places, so the two sections read as one system, not two
// unrelated illustrations.
const QUIET_ROWS = [
  { title: "Stored XSS in report comment field", status: "triaging" as const },
  { title: "Rate limit missing on password reset", status: "needs_information" as const },
];

/** A row/field that fades and lifts into place once `show` becomes true -- opacity and
 * transform only (both composited, neither triggers layout), so the panel never changes
 * height as it constructs itself. */
function Reveal({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("transition-all duration-500 ease-out", show ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0", className)}>
      {children}
    </div>
  );
}

/**
 * The hero's product environment (see docs/decisions/0036 -- Concept C, "Permanent
 * Record," built as foreground density, never an ambient canvas/particle background).
 * A cropped Sentinel workspace, not a marketing card: two quiet, muted reports sit above
 * as background noise; one active finding visibly moves through the real report
 * lifecycle (received -> critical -> evidence -> triage -> information requested ->
 * response received -> triage resumes -> decision -> audit event); on completion it
 * visibly settles into a permanent, locked audit-record entry below -- the moment the
 * whole sequence exists to deliver: a finding stops being an event and becomes an
 * accountable record.
 *
 * Labelled "Simulated for demonstration" throughout, never "live." The illustrative
 * timestamp on the locked entry sits inside a panel already disclosed as illustrative,
 * the same as the invented report titles and program name. `aria-hidden` throughout --
 * the surrounding hero copy already explains the product, and the reduced-motion path
 * renders every phase (including the filed, locked end state) already fully revealed, so
 * no information is ever gated behind animation.
 */
export function LiveWorkflowArtifact() {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState(LAST_PHASE);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) {
      setPhase(LAST_PHASE);
      setVisible(true);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    function advance(current: number) {
      if (cancelled) return;
      setPhase(current);
      if (current < LAST_PHASE) {
        timer = setTimeout(() => advance(current + 1), STEP_MS);
      } else {
        timer = setTimeout(() => {
          if (cancelled) return;
          setVisible(false);
          timer = setTimeout(() => {
            if (cancelled) return;
            setVisible(true);
            advance(0);
          }, FADE_MS);
        }, HOLD_MS);
      }
    }
    setPhase(0);
    setVisible(true);
    timer = setTimeout(() => advance(0), STEP_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reducedMotion]);

  const filed = phase >= 9;
  const triageStatus = phase >= 6 ? "triaging" : phase >= 4 ? "needs_information" : phase >= 3 ? "triaging" : "new";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "w-full max-w-3xl overflow-hidden rounded-lg border-2 border-ink bg-surface shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55)] transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-ink px-5 py-3 sm:px-6">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-canvas/70">Unpatched workspace</span>
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-canvas/45">Simulated for demonstration</span>
      </div>

      {/* Quiet rows — the noise. Static, muted, illustrative: no counts, no severity
          implying urgency, no invented statistic — just two other reports sitting in
          the inbox, visually receding so the active finding below reads as dominant. */}
      <div className="divide-y divide-border opacity-45">
        {QUIET_ROWS.map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-7">
            <span className="truncate text-sm text-ink-muted">{row.title}</span>
            <StatusBadge status={row.status} />
          </div>
        ))}
      </div>

      {/* The active finding — the only thing here with meaningful motion. */}
      <div className="border-y-2 border-action/30 bg-surface-raised p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-action">Active finding</span>
          {!filed && <span aria-hidden="true" className="size-1.5 rounded-full bg-action motion-safe:animate-pulse" />}
        </div>

        <div className={cn("mt-3 transition-opacity duration-500", filed ? "opacity-40" : "opacity-100")}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold text-ink">Authentication bypass on session refresh</p>
            {phase >= 1 && <SeverityBadge severity="critical" />}
          </div>
          <p className="mt-1 font-mono text-xs text-ink-muted">api.cloudvault.example/v1/session</p>

          <Reveal show={phase >= 2} className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
            <MetadataPair label="Evidence" value="3 artifacts" />
            <div>
              <SectionLabel>Triage</SectionLabel>
              <div className="mt-1.5">
                <StatusBadge status={triageStatus} />
              </div>
              {phase >= 4 && phase < 6 && <p className="mt-1 text-xs text-ink-muted">Information requested</p>}
              {phase >= 6 && <p className="mt-1 text-xs text-ink-muted">Response received, triage resumed</p>}
            </div>
          </Reveal>

          <Reveal show={phase >= 7} className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <SectionLabel>Decision</SectionLabel>
            <StatusBadge status="accepted" />
          </Reveal>

          <Reveal show={phase >= 8} className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-sm font-medium text-success">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Audit event recorded
          </Reveal>
        </div>
      </div>

      {/* Audit record — the permanent ledger. This is the payoff: the active finding
          above doesn't just resolve, it settles here as a locked, dated entry. */}
      <div className="p-5 sm:p-7">
        <SectionLabel>Audit record</SectionLabel>
        <div className="relative mt-2 min-h-[2.75rem]">
          <p className={cn("absolute inset-0 flex items-center text-xs text-ink-muted transition-opacity duration-500", filed ? "opacity-0" : "opacity-100")}>No entries recorded yet.</p>
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded border border-border-strong bg-surface-muted px-3 py-2.5 transition-all duration-500 ease-out",
              filed ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-muted" />
              Authentication bypass, locked
            </span>
            <span className="font-mono text-[11px] text-ink-muted">31 Aug 2026 · 14:28</span>
          </div>
        </div>
      </div>
    </div>
  );
}
