import type { ReportSeverity } from "./report";

/**
 * ineligible: a permanent classification fact -- the report reached a terminal status
 * other than `resolved`. calculated: a recommendation exists (a range, from the
 * program's effective policy version at calculation time), not yet committed.
 * finalized: the organization's actual, locked-in decision. See
 * docs/decisions/0013-bounty-decision-engine.md.
 */
export type BountyDecisionState = "ineligible" | "calculated" | "finalized";

/** One immutable version of a program's bounty policy. Never edited after creation --
 * `create_bounty_policy_version` always supersedes the previous effective version and
 * inserts a new one. `supersededAt === null` means this is the program's current
 * effective policy. */
export type BountyPolicyVersion = {
  id: string;
  programId: string;
  organizationId: string;
  versionNumber: number;
  currency: string;
  createdAt: string;
  supersededAt: string | null;
};

export type BountySeverityRange = {
  severity: ReportSeverity;
  minAmountMinorUnits: number;
  maxAmountMinorUnits: number;
};

/** A policy version plus its five mandatory per-severity ranges. */
export type BountyPolicy = BountyPolicyVersion & { ranges: BountySeverityRange[] };

/**
 * One row per report -- the actual bounty decision. `finalizedBy` (who specifically
 * finalized/adjusted it) is deliberately never exposed on this type at all: the same
 * "decision actor is manager-facing context" boundary 0009 already drew for triage
 * applies identically here. Managers see it through the existing Decision History audit
 * panel, never through this type.
 */
export type ReportBountyDecision = {
  id: string;
  reportId: string;
  state: BountyDecisionState;
  ineligibleReason: string | null;
  policyVersionId: string | null;
  severityAtCalculation: ReportSeverity | null;
  currency: string | null;
  calculatedMinAmountMinorUnits: number | null;
  calculatedMaxAmountMinorUnits: number | null;
  finalAmountMinorUnits: number | null;
  finalizedAt: string | null;
  finalizationNote: string | null;
  createdAt: string;
  updatedAt: string;
};
