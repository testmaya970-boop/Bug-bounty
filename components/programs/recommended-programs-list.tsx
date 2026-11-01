import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { RegistryList } from "../ui/security-primitives";
import { ProgramStatusBadge } from "../ui/badge";
import { focusAreaLabel } from "../../lib/researcher-identity-labels";
import type { RecommendedProgram } from "../../types/researcher-identity";

/**
 * A literal `focus_areas`/`hacking_interests` overlap match (list_recommended_programs) --
 * never a fabricated "AI model" or ranking. Only ever renders when the researcher has
 * declared at least one interest AND at least one matching public program exists; the
 * caller (app/programs/page.tsx) simply omits this section otherwise, rather than showing
 * an empty "Recommended for you" shell.
 */
export function RecommendedProgramsList({ programs }: { programs: RecommendedProgram[] }) {
  return (
    <RegistryList>
      {programs.map((program) => (
        <li key={program.id} className="motion-safe:animate-enter-rise">
          <Link prefetch={false}
            href={`/organizations/${program.organizationId}/programs/${program.id}` as Route}
            className="group flex items-start justify-between gap-4 p-4 transition-colors hover:bg-surface-muted motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:p-5"
          >
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold text-ink-muted">{program.organizationName}</p>
              <p className="mt-0.5 truncate text-base font-semibold text-ink">{program.name}</p>
              {program.focusAreas.length > 0 && <p className="mt-1 text-xs text-ink-muted">Matches your interest in {program.focusAreas.map(focusAreaLabel).join(", ")}</p>}
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
