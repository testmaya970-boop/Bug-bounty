import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { SectionLabel } from "../ui/security-primitives";
import { formatBountyRange } from "../../lib/money";
import { cn } from "../../lib/cn";
import type { MockChallenge } from "../../lib/mock/researcher-dashboard";
import type { TopBountyProgram } from "../../types/program";

type ActiveProgram = { programId: string; organizationId: string; programName: string; organizationName: string };

// Deliberately never success/warning/danger/severity-* -- those are a real report's own
// severity/status vocabulary; a CTF practice challenge is an unrelated concept and must
// never share a color with a real security signal elsewhere on this same dashboard (see
// components/ui/badge.tsx's DifficultyBadge, which fixes the identical collision).
const DIFFICULTY_TONE: Record<MockChallenge["difficulty"], string> = { Easy: "text-ink-muted", Medium: "text-accent-2", Hard: "text-ink" };

/**
 * Active Attack Surface: an asymmetric two-column layout, not one bordered card split
 * evenly in half. The left column (your active work + featured programs -- the actual
 * surface a researcher is or could be testing) gets more width and its own raised
 * surface; the right column (challenge spotlight -- practice, lower stakes) sits on a
 * quieter recessed surface. Rows use spacing and hover depth to separate, not a boxed
 * border around every item -- "every section is a bordered card" is exactly what this
 * replaces.
 *
 * `featuredPrograms` is real data (list_top_bounty_programs -- see
 * services/programs.ts's own comment: "only ever returns a program with a real,
 * currently-active bounty policy, never a fabricated ranking"), each row a real link to
 * that program's page. A previous version rendered `MOCK_FEATURED_PROGRAMS` (fabricated
 * names/bounty amounts) as inert, non-navigating buttons with the disclosure hidden
 * behind a click -- replaced outright now that the real top-bounty query this component
 * needed already exists and is used elsewhere (app/programs/page.tsx). "Start" on a
 * challenge is a real link to /ctf, not a fake local "started" toggle -- the challenge
 * titles themselves are already real, seeded CTF content (lib/mock/ctf.ts's
 * deriveDashboardSpotlight()), so the only thing that was fake was the button's behavior.
 */
export function OperationalGrid({ activePrograms, featuredPrograms, challenges }: { activePrograms: ActiveProgram[]; featuredPrograms: TopBountyProgram[]; challenges: MockChallenge[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <SectionLabel>Active attack surface</SectionLabel>
          <h2 className="mt-0.5 text-base font-semibold text-ink">Programs and challenges in play</h2>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="glass-surface-raised rounded-xl shadow-sm">
          {activePrograms.length > 0 && (
            <div className="p-5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Your active work</p>
              <ul className="mt-2.5 space-y-1">
                {activePrograms.map((participation) => (
                  <li key={participation.programId}>
                    <Link
                      href={`/organizations/${participation.organizationId}/programs/${participation.programId}` as Route}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{participation.programName}</span>
                          <span className="block text-xs uppercase tracking-wide text-ink-muted">{participation.organizationName}</span>
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-sm text-action">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={cn("p-5", activePrograms.length > 0 && "border-t border-border")}>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Featured programs</p>
            <ul className="mt-2.5 space-y-1">
              {featuredPrograms.map((program) => (
                <li key={program.id}>
                  <Link
                    href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{program.name}</span>
                      <span className="block text-xs uppercase tracking-wide text-ink-muted">{program.organizationName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-success">{formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl bg-surface-muted p-5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Challenge spotlight</p>
          <ul className="mt-2.5 space-y-2">
            {challenges.map((challenge) => (
              <li key={challenge.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{challenge.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <span className={cn("font-semibold", DIFFICULTY_TONE[challenge.difficulty])}>{challenge.difficulty}</span> · ~{challenge.estimatedMinutes} min
                  </p>
                </div>
                <Link href={"/ctf" as Route} className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md bg-action px-3 text-xs font-semibold text-on-action transition hover:bg-action-hover">
                  Start
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
