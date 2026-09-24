"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "../../lib/cn";
import { usePrefersReducedMotion } from "../../lib/motion";

/**
 * VISUAL-IDENTITY PROTOTYPE (docs/decisions/0077/0078/0080) -- NOT the
 * production homepage. Isolated at /design-preview/state-record so it can be
 * judged as a visual-language prototype, not a finished landing page (per
 * explicit instruction). Do not wire this into app/page.tsx yet.
 *
 * The core bet: ONE real object (a "Security Record" -- record id, title,
 * actor, timestamp, state, evidence, transition history, decision,
 * verification) that visibly TRANSFORMS as the page scrolls, rather than a
 * sequence of illustrated sections describing a record. The record's own
 * transition history never disappears -- new state is appended, nothing is
 * replaced -- because "the record does not disappear" is the actual product
 * philosophy, not a tagline.
 *
 * VISUAL MODE (decision 0080, taste-skill:brutalist-skill, Swiss Industrial
 * Print): this component went through several earlier visual directions --
 * a color-chapter homepage, a canvas particle field, a Three.js node graph,
 * a raw-WebGL grainy noise shader with GSAP mouse parallax -- each rejected
 * in turn for reading as a generic AI-gradient/particle-network pattern
 * regardless of the renderer underneath. The current direction replaces all
 * of that with print/industrial-manual typography: massive uppercase
 * macro-type with tight negative tracking, a single matte-paper substrate
 * (never inverted to dark -- brutalist mode's own rule is "one substrate,
 * never mixed"), 2px structural borders instead of hairlines, square
 * corners, hard offset shadows instead of soft blurred ones, and hazard red
 * as the system's ONLY accent color, reserved exclusively for the record's
 * one genuinely critical moment (the "Finding" stage's severity marker) --
 * never a second hue standing in for "discovery" or "resolution."
 */

type StageKey = "signal" | "evidence" | "finding" | "triage" | "needs_information" | "decision" | "fix" | "verification" | "record";

// Swiss Industrial Print mode (taste-skill:brutalist-skill): "choose ONE
// accent color and use it consistently" -- red is the system's only accent,
// reserved exclusively for "finding" (the genuine critical-severity moment).
// Every other stage is carbon-ink/muted, never a second hue standing in for
// "discovery" or "resolution" the way the earlier blue/amber/green system
// did -- that per-stage rainbow was itself one of the generic-AI-gradient
// patterns this rewrite exists to remove.
const STAGES: { key: StageKey; label: string; critical: boolean }[] = [
  { key: "signal", label: "Signal", critical: false },
  { key: "evidence", label: "Evidence", critical: false },
  { key: "finding", label: "Finding", critical: true },
  { key: "triage", label: "Triage", critical: false },
  { key: "needs_information", label: "Needs information", critical: false },
  { key: "decision", label: "Decision", critical: false },
  { key: "fix", label: "Fix", critical: false },
  { key: "verification", label: "Verification", critical: false },
  { key: "record", label: "Record", critical: false },
];

/** Fires `onEnter` once a section's ref crosses the viewport's vertical
 * center -- the scroll-scrubbing primitive every stage transition below uses.
 * A plain IntersectionObserver at a tuned rootMargin, not a scroll-position
 * calculation -- cheaper, and naturally respects browser scroll-anchoring.
 * `threshold: [0, 0.5, 1]` (not a single 0) so a fast scroll that jumps a
 * short StageBeat fully past a narrow root band in one frame still fires at
 * least one intersection callback for it -- a single `threshold: 0` only
 * fires on the entering/exiting edges, which a fast scroll can skip past
 * between animation frames, which was the live bug: the record froze after
 * the first couple of stages on any scroll faster than a slow manual drag. */
function useStageObserver(stageIndex: number, setActive: (i: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setActive(stageIndex);
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [stageIndex, setActive]);
  return ref;
}

/** The signature object, rebuilt for Swiss Industrial Print (taste-skill:
 * brutalist-skill): square corners (unchanged -- this was already right),
 * a 2px carbon-ink border (not a hairline -- the skill calls for "visible
 * compartmentalization" via solid borders, not subtle ones), a hard offset
 * shadow instead of the prior soft blurred one (soft drop shadows are
 * explicitly prohibited), and monochrome text throughout with red reserved
 * exclusively for the "finding" stage's critical marker -- every other
 * stage-history row is carbon-ink, never a second accent hue standing in.
 * `activeStage` controls which fields are revealed/highlighted; every field
 * from a prior stage stays visible once reached (the accumulating-history
 * behavior the brief calls for), just without the old per-stage coloring. */
function SecurityRecord({ activeStageIndex }: { activeStageIndex: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const stage = STAGES[activeStageIndex];
  const reached = (key: StageKey) => activeStageIndex >= STAGES.findIndex((s) => s.key === key);

  return (
    <div aria-hidden="true" className="w-full max-w-xl border-2 border-record-ink bg-record-canvas font-mono text-sm shadow-[6px_6px_0_0_var(--record-ink)]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-record-ink px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-record-ink-muted">[ REC-0000842 ]</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] transition-colors", !reducedMotion && "duration-500", stage.critical ? "text-record-red" : "text-record-ink")}>
          {stage.critical ? "[!]" : ">>>"} {stage.label}
        </span>
      </div>

      <div className={cn("border-b-2 border-record-ink px-4 py-3 transition-colors", !reducedMotion && "duration-500")}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-sans text-base font-extrabold uppercase tracking-tight text-record-ink">Authentication bypass on session refresh</p>
          {reached("finding") && (
            <span className={cn("shrink-0 border border-record-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] transition-opacity", !reducedMotion && "duration-500", stage.key === "finding" ? "border-record-red text-record-red" : "text-record-ink-muted")}>
              Critical
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-record-ink-muted">api.cloudvault.example/v1/session</p>
      </div>

      {/* EVIDENCE -- appears once reached, never removed afterward. */}
      <div className={cn("grid transition-all", !reducedMotion && "duration-500 ease-out", reached("evidence") ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="border-b-2 border-record-ink px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-record-ink-muted">evidence</p>
            <p className="mt-1 text-record-ink">3 artifacts attached · request log, repro script, screenshot</p>
          </div>
        </div>
      </div>

      {/* TRANSITION HISTORY -- the append-only log. Every row that has been
          reached stays; nothing is ever removed from this list, matching the
          product's own append-only reputation-ledger rule elsewhere in this
          codebase. Monochrome throughout -- the "current" row is bold ink,
          not a color, since red stays reserved for the critical marker. */}
      <div className="border-b-2 border-record-ink px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-record-ink-muted">transition history</p>
        <ul className="mt-1.5 space-y-1">
          {reached("triage") && (
            <li className={cn("flex items-center gap-2", activeStageIndex === STAGES.findIndex((s) => s.key === "triage") ? "font-bold text-record-ink" : "text-record-ink-muted")}>
              <span aria-hidden="true" className="text-[10px]">
                {">"}
              </span>
              triaging
            </li>
          )}
          {reached("needs_information") && (
            <li className={cn("flex items-center gap-2", activeStageIndex === STAGES.findIndex((s) => s.key === "needs_information") ? "font-bold text-record-ink" : "text-record-ink-muted")}>
              <span aria-hidden="true" className="text-[10px]">
                {">"}
              </span>
              needs_information <span className="text-[10px]">(returned to triage on response)</span>
            </li>
          )}
          {reached("decision") && (
            <li className={cn("flex items-center gap-2", activeStageIndex === STAGES.findIndex((s) => s.key === "decision") ? "font-bold text-record-ink" : "text-record-ink-muted")}>
              <span aria-hidden="true" className="text-[10px]">
                {">"}
              </span>
              accepted <span className="text-[10px]">(decision recorded, actor: org_admin)</span>
            </li>
          )}
          {reached("fix") && (
            <li className={cn("flex items-center gap-2", activeStageIndex === STAGES.findIndex((s) => s.key === "fix") ? "font-bold text-record-ink" : "text-record-ink-muted")}>
              <span aria-hidden="true" className="text-[10px]">
                {">"}
              </span>
              fix deployed
            </li>
          )}
          {reached("verification") && (
            <li className={cn("flex items-center gap-2", activeStageIndex === STAGES.findIndex((s) => s.key === "verification") ? "font-bold text-record-ink" : "text-record-ink-muted")}>
              <span aria-hidden="true" className="text-[10px]">
                {">"}
              </span>
              verified <span className="text-[10px]">(retest confirmed closed)</span>
            </li>
          )}
          {!reached("triage") && <li className="text-record-ink-muted/50">awaiting triage</li>}
        </ul>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-record-ink-muted">record</p>
        <p className={cn("mt-1 transition-colors", !reducedMotion && "duration-500", reached("record") ? "font-bold text-record-ink" : "text-record-ink-muted/50")}>
          {reached("record") ? "Locked · 31 Aug 2026 · 14:28 · readable by every party to the report" : "Not yet closed"}
        </p>
      </div>
    </div>
  );
}

/** One narrative beat -- a scroll anchor with its own observer, so the record
 * above updates as this section crosses center screen. Two real graphic
 * devices fill what was previously dead whitespace (the actual reported
 * problem: too much empty space read as generic, not restrained):
 * (1) a giant ghost stage-numeral (reusing the record's own "01/02/..."
 * transition-history numbering as its type, not an invented decoration), and
 * (2) a short connecting rail tick that visually ties this beat to the
 * record's own provenance line. `align` alternates the editorial copy left/
 * right to avoid the "headline / paragraph / card" repetition the brief
 * calls out. Reduced from min-h-[70vh] (mostly empty) to a content-driven
 * height with the numeral providing weight instead of blank space. */
// Swiss Industrial Print mode (taste-skill:brutalist-skill) -- red is the
// ONLY accent color the whole system permits; every stage that previously
// carried its own blue/amber/green identity is now monochrome carbon-ink,
// with red reserved exclusively for the one genuinely critical moment
// (severity assessment). `critical` replaces the old five-color `accent`
// prop -- a boolean, not a palette, because the skill is explicit that
// mixing accent hues is what makes brutalist systems collapse back into
// generic SaaS coloring.
function StageBeat({
  index,
  setActive,
  eyebrow,
  statement,
  detail,
  align = "left",
  critical = false,
}: {
  index: number;
  setActive: (i: number) => void;
  eyebrow: string;
  statement: string;
  detail: string;
  align?: "left" | "right";
  critical?: boolean;
}) {
  const ref = useStageObserver(index, setActive);
  const number = String(index + 1).padStart(2, "0");
  return (
    <div ref={ref} className="relative overflow-hidden border-b-2 border-record-ink px-4 py-14 sm:px-6 sm:py-20">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 z-0 select-none font-mono text-[6rem] font-bold leading-none tracking-tighter text-record-ink/[0.05] sm:-top-4 sm:text-[9rem] lg:-top-10 lg:text-[13rem]"
        style={{ [align === "right" ? "right" : "left"]: "-1rem" } as React.CSSProperties}
      >
        {number}
      </span>
      <div className={cn("relative z-10 mx-auto w-full max-w-xl", align === "right" && "ml-auto mr-0 lg:mr-[8vw] lg:max-w-md", align === "left" && "lg:ml-[8vw] lg:max-w-md")}>
        <p className={cn("flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em]", critical ? "text-record-red" : "text-record-ink-muted")}>
          <span aria-hidden="true">{critical ? "[!]" : "///"}</span>
          {eyebrow}
        </p>
        <p className="mt-3 font-display text-2xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em] text-record-ink sm:text-3xl">{statement}</p>
        <p className="mt-3 max-w-sm font-mono text-sm leading-relaxed text-record-ink-muted">{detail}</p>
      </div>
    </div>
  );
}

export function SecurityRecordPrototype() {
  const [active, setActive] = useState(0);

  return (
    <div className="min-h-dvh bg-record-canvas text-record-ink">
      {/* 1. NAVIGATION -- Swiss Industrial Print (taste-skill:brutalist-skill):
          a 2px structural rule instead of a hairline, no backdrop-blur (a
          modern-translucency effect the skill prohibits outright), the
          wordmark framed in ASCII brackets like a technical label, "Get
          started" as a solid ink block rather than a soft pill button. */}
      <header className="sticky top-0 z-20 border-b-2 border-record-ink bg-record-canvas px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-mono text-sm font-bold uppercase tracking-[0.15em] text-record-ink">[ UNPATCHED ]</span>
          <nav aria-label="Prototype entry points" className="flex items-center gap-5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-record-ink-muted">
            <Link prefetch={false} href="/sign-in" className="hover:text-record-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-record-ink">
              Sign in
            </Link>
            <Link prefetch={false}
              href={"/researchers/sign-up" as Route}
              className="border-2 border-record-ink bg-record-ink px-3 py-1.5 text-record-canvas transition-colors hover:bg-record-canvas hover:text-record-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-record-ink"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* 2. HERO -- Swiss Industrial Print's macro-typography, replacing the
            prior shader/parallax hero entirely (gradients and translucency
            are prohibited under this mode). The headline is set at
            clamp()-scaled, viewport-bleeding size with tight negative
            tracking and full uppercase -- "monolithic block" typography as
            the primary visual weight, no imagery at all. A visible
            crosshair-style corner marker and a hazard-red status line are
            the only graphic devices; red is reserved for this one alert
            role and appears nowhere else on the page as decoration. */}
        <section className="relative overflow-hidden border-b-2 border-record-ink px-4 pb-16 pt-16 sm:px-6 sm:pt-20">
          <div aria-hidden="true" className="pointer-events-none absolute left-4 top-4 font-mono text-lg text-record-ink/20 sm:left-6 sm:top-6">
            +
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute right-4 top-4 font-mono text-lg text-record-ink/20 sm:right-6 sm:top-6">
            +
          </div>
          <div className="mx-auto max-w-5xl">
            <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-record-red">
              <span aria-hidden="true">[!]</span> REC-0000842 // STATUS: OPEN
            </p>
            <h1
              className="mt-6 font-display font-extrabold uppercase leading-[0.88] tracking-[-0.04em] text-record-ink"
              style={{ fontSize: "clamp(2.75rem, 8vw, 7rem)" }}
            >
              Security work
              <br />
              should leave a<br />
              record.
            </h1>
            <p className="mt-8 max-w-lg font-mono text-sm leading-relaxed text-record-ink-muted">
              ONE FINDING, FOLLOWED END TO END. SCROLL TO WATCH IT MOVE THROUGH UNPATCHED&rsquo;S REAL LIFECYCLE &mdash; NOTHING SKIPPED, NOTHING ERASED.
            </p>
          </div>
        </section>

        {/* 3+4+5. THE SCROLL SEQUENCE -- a sticky record on the right (desktop)
            / above (mobile), with each narrative beat as its own scroll
            anchor on the left. This is "one distinctive scroll-driven
            transition," not eight repeated card sections. */}
        <section className="relative px-4 sm:px-6" aria-label="Security record lifecycle, scroll to advance">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_26rem] lg:gap-4">
            <div>
              <StageBeat index={0} setActive={setActive} eyebrow="Signal" statement="Something surfaces. Not yet a finding -- just a signal worth looking at." detail="A researcher notices an anomaly in session-refresh behavior. Nothing is recorded yet; this is the moment before evidence exists." />
              <StageBeat index={1} setActive={setActive} eyebrow="Evidence" statement="Evidence attaches to the record. Immutable the moment it's uploaded." align="right" detail="Text, code, a request log, a file -- once attached, it cannot be edited. A correction becomes a new entry, never a silent change to this one." />
              <StageBeat index={2} setActive={setActive} eyebrow="Finding" critical statement="The record becomes a finding: title, target, and a critical severity assessment." detail="Structure appears where there was only a signal a moment ago -- the record is now something an organization can act on." />
              <StageBeat index={3} setActive={setActive} eyebrow="Triage" statement="Triage begins. The record enters a real state machine, not a status label." align="right" detail="New, triaging, needs information, accepted -- every transition here needs an actor and an event. There is no generic field that can change silently." />
              <StageBeat index={4} setActive={setActive} eyebrow="Needs information" statement="The organization asks a question. The record can return to triage -- it never resets." detail="A branch, not a dead end: the finding waits for a response, then resumes exactly where it left off. The earlier evidence is still there." />
              <StageBeat index={5} setActive={setActive} eyebrow="Decision" statement="A decision is recorded, with a reason attached to it." align="right" detail="Accepted, duplicate, informative, not applicable, or rejected -- never a status flipped with no explanation traceable back to an actor." />
              <StageBeat index={6} setActive={setActive} eyebrow="Fix" statement="The underlying issue is remediated. The record notes it, it doesn't forget what came before." detail="Fixing the issue doesn't erase the finding's history -- the record accumulates; it never resets to a blank state." />
              <StageBeat index={7} setActive={setActive} eyebrow="Verification" statement="Verification confirms the fix actually holds." align="right" detail="A retest, not an assumption. Only once this is confirmed does the record move to its final, closed state." />
              <StageBeat index={8} setActive={setActive} eyebrow="Record" statement="Closed. Every stage that came before it is still readable, in order." detail="Nothing quietly disappears when a report resolves. The full path -- signal to verified -- stays part of the permanent record." />
            </div>
            <div className="hidden lg:sticky lg:top-24 lg:block lg:h-fit lg:justify-self-end lg:pt-[35vh]">
              <SecurityRecord activeStageIndex={active} />
            </div>
            {/* Mobile: the record re-renders once, pinned above the fold at
                the top of the sequence rather than sticky-following (a
                sticky element competing with a long scroll on small
                viewports reads as janky, not deliberate). */}
            <div className="lg:hidden">
              <div className="sticky top-16 z-10 -mx-4 border-b-2 border-record-ink bg-record-canvas px-4 py-4 sm:-mx-6 sm:px-6">
                <SecurityRecord activeStageIndex={active} />
              </div>
            </div>
          </div>
        </section>

        {/* 6. FINAL VERIFIED-RECORD STATE -- Swiss Industrial Print rule:
            "choose ONE substrate palette and use it consistently; never mix
            light and dark within the same interface" -- the prior version's
            near-black inversion is exactly the violation the skill calls
            out ("a single dark section breaking an otherwise light page
            looks like a copy-paste accident"), so this stays on the same
            matte-paper canvas. The closing emphasis instead comes from the
            heaviest border weight and type scale on the page, plus the
            hazard-red status stamp -- structural weight, not a substrate
            swap, carries the "this is final" feeling. */}
        <section className="border-t-4 border-record-ink px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <p className="flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-record-red">
              <span aria-hidden="true">[!]</span> REC-0000842 // STATUS: CLOSED
            </p>
            <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[0.9] tracking-[-0.03em] text-record-ink sm:text-5xl">The record does not disappear.</h2>
            <p className="mx-auto mt-4 max-w-md font-mono text-sm leading-relaxed text-record-ink-muted">Every decision on Unpatched stays attributed, timestamped, and readable &mdash; to the researcher who found it, and the organization that closed it.</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-5 font-mono text-sm font-bold uppercase tracking-[0.1em]">
              <Link prefetch={false}
                href={"/researchers/sign-up" as Route}
                className="border-2 border-record-ink bg-record-ink px-5 py-2.5 text-record-canvas transition-colors hover:bg-record-canvas hover:text-record-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-record-ink"
              >
                Continue as researcher
              </Link>
              <Link prefetch={false} href={"/organizations/sign-up" as Route} className="border-b-2 border-record-ink text-record-ink hover:text-record-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-record-ink">
                Continue as organization
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
