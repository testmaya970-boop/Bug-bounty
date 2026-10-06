import React from "react";
import { SectionLabel } from "../ui/security-primitives";
import { REPUTATION_FACT_TYPE_DISPLAY_ORDER } from "../../lib/reputation-labels";
import type { ReputationFactCount, ReputationFactType } from "../../types/reputation";

/** Sentence-case, honest, count-noun labels ("N resolved reports") -- distinct from
 * lib/reputation-labels.ts's event-phrased ledger row labels ("Report resolved"). No
 * gamification, no score, no ranking. */
export const FACT_TYPE_LABELS: Record<ReputationFactType, string> = {
  report_resolved: "Resolved reports",
  bounty_finalized: "Bounties finalized",
  report_duplicate: "Duplicate reports",
  report_informative: "Informative reports",
  report_not_applicable: "Not-applicable reports",
  report_rejected: "Rejected reports",
  ctf_challenge_solved: "CTF challenges solved",
};

/**
 * The primary signal on the reputation page: a researcher's own objective contribution
 * categories, counted, never scored -- rendered as a plain row of label-above-value
 * pairs (not a card grid), the same weight as every other technical fact block in this
 * product. No leaderboard, no ranking, no badges, no XP -- see
 * docs/decisions/0016-reputation-ledger-foundation.md for why. The empty case is handled
 * one level up (app/researchers/page.tsx's own honest empty state), since an empty
 * summary alongside an empty ledger is one product moment, not two.
 */
export function ReputationSummarySection({ counts }: { counts: ReputationFactCount[] }) {
  const byType = new Map(counts.map((entry) => [entry.factType, entry.count]));

  return (
    <div>
      <SectionLabel>Verified outcomes</SectionLabel>
      <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
        {REPUTATION_FACT_TYPE_DISPLAY_ORDER.map((factType) => {
          const count = byType.get(factType) ?? 0;
          if (count === 0) return null;
          return (
            <div key={factType}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{FACT_TYPE_LABELS[factType]}</dt>
              <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{count}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
