"use client";

import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { useCountUp } from "../../lib/motion";
import type { MOCK_RESEARCHER_STATUS } from "../../lib/mock/researcher-dashboard";

type Status = typeof MOCK_RESEARCHER_STATUS;
type PrimaryAction = { eyebrow: string; title: string; description: string; label: string; href: Route };

type NumericStatKey = Exclude<keyof Status, "lifetimeRewardsLabel">;

const STAT_ITEMS: { key: NumericStatKey; label: string }[] = [
  { key: "programsFollowed", label: "Programs" },
  { key: "submissions", label: "Submissions" },
  { key: "acceptedReports", label: "Accepted" },
  { key: "reputationPoints", label: "Reputation" },
];

/** A real, already-known stat that counts up on mount (docs/decisions/0062) instead of
 * appearing instantly -- `useCountUp` short-circuits to the final value under reduced
 * motion, so this is purely a mount-time flourish, never the only way the value reads. */
function StatValue({ value }: { value: number }) {
  const display = useCountUp(value);
  return <>{display.toLocaleString("en-US")}</>;
}

/** A live-looking technical readout line -- session/clock chrome that makes the action
 * panel read as an operator console rather than a marketing hero. Real, derivable facts
 * only (a stat already computed elsewhere, or a literal count from `status`) -- never a
 * fabricated metric per DESIGN.md ("use actual data or a clearly marked fixture"). */
function Telemetry({ status }: { status: Status }) {
  const acceptRate = status.submissions > 0 ? Math.round((status.acceptedReports / status.submissions) * 100) : 0;
  return (
    <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-canvas/15 pt-4 font-mono text-[11px] uppercase tracking-wider text-canvas/50">
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-success motion-safe:animate-glow-pulse" />
        <dt className="sr-only">Session status</dt>
        <dd>Session active</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt>Accept rate</dt>
        <dd className="text-canvas/80">{acceptRate}%</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt>Programs tracked</dt>
        <dd className="text-canvas/80">{status.programsFollowed}</dd>
      </div>
    </dl>
  );
}

/**
 * The command row: the page's one dominant, asymmetric zone -- not a card among cards.
 * The dark action panel gets real weight (40px padding, a lifted shadow, a telemetry
 * readout) so it reads as the single thing on the screen worth looking at first; the stat
 * rail steps down in surface depth beside it, differentiated (a bordered hero stat vs.
 * three flatter secondary ones) rather than four equally-weighted tiles.
 *
 * Both halves get a one-time `hero-reveal` on mount, staggered (docs/decisions/0057) --
 * the dashboard's own first-paint moment, matching the marketing page's hero treatment.
 * Fires once per real mount (no key/effect re-triggers it on data refresh), motion-safe
 * gated so reduced motion gets both halves fully visible immediately.
 */
export function CommandRow({ action, status }: { action: PrimaryAction; status: Status }) {
  const [heroStat, ...restStats] = STAT_ITEMS;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="group relative overflow-hidden rounded-xl bg-ink px-6 py-8 text-canvas shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)] transition-shadow duration-200 sm:px-10 sm:py-10 motion-safe:animate-hero-reveal motion-reduce:transition-none hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65),0_0_40px_-8px_var(--glow-action)]">
        <div aria-hidden="true" className="dot-grid pointer-events-none absolute inset-0 text-canvas" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--glow-action),transparent_60%)] opacity-60" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,var(--glow-accent-2),transparent_55%)] opacity-30" />
        <div className="relative">
          {/* text-action-on-dark, not text-action: --action (#c7331e) is AA-safe for
              button/link text on the light canvas but fails contrast against this dark
              panel (2.7:1) -- --action-on-dark is the brighter, dark-surface-only
              variant (5.8:1 here), see app/globals.css's own token comment. */}
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-action-on-dark">{action.eyebrow}</p>
          {/* Not a second <h1> -- the shell's own page title (AppShell/AppShellClient) IS
              this action's title (see app/page.tsx, where AppShell's title prop is now
              primaryAction.title, not the generic word "Dashboard"). Repeating it here as
              plain styled text keeps the exact same visual weight inside the dark panel
              without a competing heading element -- one real <h1> per screen. */}
          <p className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">{action.title}</p>
          <p className="mt-3 max-w-lg text-sm text-canvas/70">{action.description}</p>
          <Link
            href={action.href}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-canvas px-5 text-sm font-semibold text-ink transition duration-200 hover:bg-canvas/90 hover:shadow-[0_0_24px_var(--glow-action)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas"
          >
            {action.label} <span aria-hidden="true">→</span>
          </Link>
          <Telemetry status={status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 motion-safe:animate-hero-reveal [animation-delay:80ms]">
        {/* The rail's own oversized hero metric -- bigger type, a luminous border, and a
            hover glow so it reads as a second point of gravity beside the action panel,
            not a fourth equally-weighted tile. */}
        <div className="glass-surface-raised col-span-2 rounded-lg p-4 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-glass-border-strong hover:shadow-[0_0_24px_-4px_var(--glow-action)]">
          <SectionLabel>{heroStat.label}</SectionLabel>
          <p className="mt-1.5 font-mono text-4xl font-semibold tabular-nums text-ink">
            <StatValue value={status[heroStat.key]} />
          </p>
        </div>
        {restStats.map((item) => (
          <div key={item.key} className="glass-surface rounded-lg p-3.5 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-glass-border-strong">
            <SectionLabel>{item.label}</SectionLabel>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-ink">
              <StatValue value={status[item.key]} />
            </p>
          </div>
        ))}
        <Link
          href={"/researchers" as Route}
          className="glass-surface group/reward col-span-2 flex items-center justify-between rounded-lg p-3.5 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-glass-border-strong hover:shadow-[0_0_20px_-6px_var(--glow-accent-2)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          <div>
            <SectionLabel>Lifetime rewards</SectionLabel>
            <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-ink">{status.lifetimeRewardsLabel}</p>
          </div>
          <span aria-hidden="true" className="text-ink-muted transition-transform duration-200 group-hover/reward:translate-x-0.5 motion-reduce:transition-none">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}
