import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList } from "../ui/security-primitives";
import { ProgramStatusBadge } from "../ui/badge";
import { formatBountyRange } from "../../lib/money";
import type { TopBountyProgram } from "../../types/program";

/**
 * The curated "highest-paying" section -- list_top_bounty_programs only ever returns a
 * program with a real, currently-active bounty policy, ordered by its real ceiling. Never
 * a fabricated ranking. See docs/decisions/0054.
 */
export function TopBountyProgramsList({ programs }: { programs: TopBountyProgram[] }) {
  return (
    <RegistryList>
      {programs.map((program) => (
        <li key={program.id} className="motion-safe:animate-enter-rise">
          <Link
            href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
            className="group flex items-start justify-between gap-4 p-4 transition-colors hover:bg-surface-muted motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:p-5"
          >
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{program.organizationName}</p>
              <p className="mt-0.5 truncate text-base font-semibold text-ink">{program.name}</p>
              <p className="mt-1 text-sm font-semibold text-success">{formatBountyRange(program.bountyMinMinorUnits, program.bountyMaxMinorUnits, program.bountyCurrency)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <ProgramStatusBadge status={program.status} />
              <span aria-hidden="true" className="text-ink-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
                →
              </span>
            </div>
          </Link>
        </li>
      ))}
    </RegistryList>
  );
}
