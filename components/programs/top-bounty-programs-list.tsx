import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ProgramStatusBadge } from "../ui/badge";
import { formatBountyRange } from "../../lib/money";
import type { TopBountyProgram } from "../../types/program";

/**
 * The curated "highest-paying" section -- list_top_bounty_programs only ever returns a
 * program with a real, currently-active bounty policy, ordered by its real ceiling. Never
 * a fabricated ranking. See docs/decisions/0054.
 *
 * Deliberately NOT RegistryList (the shared bordered-row shell every plain list in this
 * app uses, including the full public-program registry directly below this section) --
 * confirmed live as the actual "generic" complaint about this page: a featured, curated
 * section and a plain alphabetical-ish list looked identical except for a text label.
 * This renders as its own card grid instead, with the real bounty ceiling given the
 * dominant visual weight a "highest-paying" claim should have, so the featured section
 * is visually, not just textually, distinct from the registry beneath it.
 */
export function TopBountyProgramsList({ programs }: { programs: TopBountyProgram[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <li key={program.id} className="motion-safe:animate-enter-rise">
          <Link
            prefetch={false}
            href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
            className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border-strong bg-surface p-5 transition duration-150 hover:-translate-y-0.5 hover:border-success/40 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{program.organizationName}</p>
                <ProgramStatusBadge status={program.status} />
              </div>
              <p className="mt-1 break-words text-base font-semibold text-ink">{program.name}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-bold tracking-tight text-ink">{formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)}</p>
              <span aria-hidden="true" className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
                →
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
