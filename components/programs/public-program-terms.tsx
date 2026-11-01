import React from "react";
import { formatBountyRange } from "../../lib/money";
import type { PublicProgramSummary } from "../../types/program";

/** What a researcher needs before joining (202610060014): the bounty range from the
 * program's current policy, and whether identity verification is required to submit. */
export function PublicProgramTerms({ program }: { program: PublicProgramSummary }) {
  const hasBounty = program.programType !== "vdp" && program.bountyCurrency && program.bountyMaxMinorUnits !== null;
  if (!hasBounty && !program.requiresKyc) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {hasBounty && (
        <li className="text-ink">
          Bounties <span className="font-mono font-semibold">{formatBountyRange(program.bountyMinMinorUnits ?? 0, program.bountyMaxMinorUnits ?? 0, program.bountyCurrency!)}</span>
        </li>
      )}
      {program.requiresKyc && <li className="font-medium text-warning">Identity verification required before you can submit</li>}
    </ul>
  );
}
