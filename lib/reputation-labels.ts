import type { ReputationFactType } from "@/types/reputation";

// Pure presentation logic, deliberately not in services/reputation.ts (which is
// server-only) -- the same reason lib/report-status.ts exists separately from
// services/reports.ts. Event-phrased (something that happened), distinct from
// components/reputation/reputation-summary.tsx's own count-noun labels ("Resolved
// reports"): a ledger row reads as an event, a summary tile reads as a tally. Sentence-
// case, honest, no gamification. See docs/decisions/0016-reputation-ledger-foundation.md.
const REPUTATION_FACT_TYPE_EVENT_LABELS: Record<ReputationFactType, string> = {
  report_resolved: "Report resolved",
  report_duplicate: "Report marked duplicate",
  report_informative: "Report marked informative",
  report_not_applicable: "Report marked not applicable",
  report_rejected: "Report rejected",
  bounty_finalized: "Bounty finalized",
};

export function reputationFactTypeEventLabel(factType: ReputationFactType): string {
  return REPUTATION_FACT_TYPE_EVENT_LABELS[factType];
}

// Deliberately neutral order (not "best to worst") -- resolved/bounty first only because
// they are unambiguously positive outcomes every researcher recognizes; duplicate/
// informative/not_applicable/rejected are listed without any implied ranking among
// themselves, since this slice assigns none. Matches
// components/reputation/reputation-summary.tsx's own DISPLAY_ORDER.
export const REPUTATION_FACT_TYPE_DISPLAY_ORDER: ReputationFactType[] = [
  "report_resolved",
  "bounty_finalized",
  "report_duplicate",
  "report_informative",
  "report_not_applicable",
  "report_rejected",
];
