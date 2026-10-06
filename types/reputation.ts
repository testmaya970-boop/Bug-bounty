import type { ReportSeverity } from "./report";
import type { ResearcherFocusArea, ResearcherSecurityFocus } from "./researcher-identity";

/**
 * FACT, never INTERPRETATION. `ReputationFactType` records what objectively happened --
 * never a score, never a point value. No final scoring formula exists yet; aggregation
 * (a count per category) is the only primitive this slice provides. See
 * docs/decisions/0016-reputation-ledger-foundation.md.
 *
 * report_resolved: the strongest positive signal every platform studied converges on --
 * an organization confirmed a real finding and fixed it.
 * report_duplicate/report_informative/report_not_applicable/report_rejected: real,
 * final, organization-confirmed outcomes, recorded WITHOUT any assigned valence --
 * duplicates are often submission-order accidents, not quality problems; "informative"
 * and "rejected" are not evidence of researcher malice by themselves. A future scoring
 * model decides what these mean; this table only records that they happened.
 * bounty_finalized: an objective business outcome -- never the amount. The payment
 * domain remains the sole authority for money.
 *
 * Deliberately excluded (see the ADR for the full reasoning): report submission alone
 * (activity, not an outcome), every provisional status (new/triaging/needs_information/
 * accepted -- not terminal), and researcher suspension/revocation (a single, unilateral
 * admin action with no required justification captured anywhere today -- too weak and
 * too easily biased a signal to treat as reputation provenance yet).
 */
export type ReputationFactType = "report_resolved" | "report_duplicate" | "report_informative" | "report_not_applicable" | "report_rejected" | "bounty_finalized";

/** The one safe, derived read exposed to a researcher about their own history -- a
 * plain count per objective category, never a score. See
 * `get_my_reputation_summary` and `services/reputation.ts`. */
export type ReputationFactCount = {
  factType: ReputationFactType;
  count: number;
};

/** One row of the researcher's own, real reputation_ledger history -- an immutable,
 * organization-confirmed event, never a score. `confirmedSeverity` is carried on the
 * fact itself (never a standalone fact_type -- see docs/decisions/0016), so it is
 * already authorized for the owning researcher to see: `set_report_severity` is
 * org-only, but a researcher already reads their own report's `confirmed_severity`
 * directly (services/reports.ts's REPORT_SELECT). `duplicateOfReportId` is populated
 * only when `factType === "report_duplicate"` (enforced in the database by
 * `reputation_ledger_duplicate_shape_check`). See `getMyReputationLedger` in
 * `services/reputation.ts` for how report title/program name are joined on afterward --
 * `reputation_ledger` carries no denormalized title of its own. */
export type ReputationLedgerEntry = {
  id: string;
  factType: ReputationFactType;
  reportId: string;
  programId: string;
  organizationId: string;
  confirmedSeverity: ReportSeverity | null;
  duplicateOfReportId: string | null;
  occurredAt: string;
};

/**
 * A real, public, computed reputation score -- docs/decisions/0065 formally supersedes
 * 0016's "no score, ranking, badge, or leaderboard exists" clause. Computed read-side
 * from `reputation_ledger` (never a stored/mutable column): resolved x 25, bounty_finalized
 * x 10, rejected x -5; duplicate/informative/not_applicable weighted zero, the same neutral
 * treatment 0016 always gave them. See `get_researcher_reputation_score` in
 * services/reputation.ts.
 */
export type ReputationScore = number;

/** One row of the real, public leaderboard (`get_public_leaderboard`) -- ordered by score
 * descending, ties broken by resolvedCount then researcherId, both server-side. Only
 * researchers with at least one reputation_ledger fact appear; a researcher with zero
 * history is absent, never shown at score 0. A researcher who has not set a public username
 * still holds their rank but appears as "Anonymous researcher" with a null researcherId --
 * except to themself (202610060002). */
export type PublicLeaderboardRow = {
  researcherId: string | null;
  displayName: string;
  publicUsername: string | null;
  score: ReputationScore;
  resolvedCount: number;
  bountyFinalizedCount: number;
};

/** The signed-in researcher's own real rank on the same leaderboard the public page shows
 * -- computed via the identical aggregation, never a second formula that could disagree
 * with it. See `get_my_leaderboard_position`. */
export type MyLeaderboardPosition = {
  rank: number;
  score: ReputationScore;
  totalResearchers: number;
};

/** The public researcher profile (`get_public_researcher_profile`) -- composes display
 * name, biography, and stated focus areas (already public-read per 0051) with the new
 * score. Deliberately excludes personal details, KYC, payout, and external platform
 * handles -- see 0065's own "one field this document does NOT restore" section. */
export type PublicResearcherProfile = {
  researcherId: string;
  displayName: string;
  publicUsername: string;
  biography: string | null;
  hackingInterests: ResearcherFocusArea[];
  securityFocus: ResearcherSecurityFocus[];
  score: ReputationScore;
  resolvedCount: number;
  bountyFinalizedCount: number;
};

/**
 * Achievement badges (docs/decisions/0071) -- entirely computed read-side from already-
 * true facts, never a stored/mutable badge row. Four families are outcome-based
 * (reputation_ledger, unchanged); `prolific_researcher` is a deliberate, explicitly
 * scoped exception counting raw report submissions rather than confirmed outcomes,
 * mirroring Bugcrowd's own volume-based "Submission Shogun" badge -- it never feeds the
 * score formula or the leaderboard, both of which stay outcome-only.
 */
export type BadgeKey = "prolific_researcher" | "resolver" | "critical_finder" | "bounty_earner" | "program_breadth";
export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export type ResearcherBadge = {
  badgeKey: BadgeKey;
  tier: BadgeTier;
  currentValue: number;
  /** null once a badge has reached its highest (platinum) tier -- there is no further
   * threshold to progress toward. */
  nextThreshold: number | null;
};
