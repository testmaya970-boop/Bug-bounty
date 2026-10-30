import type { OrganizationMemberStatus, OrganizationRole } from "./auth";
import type { ReportSeverity, ReportStatus } from "./report";
import type { ProgramResearcherStatus } from "./researcher";

/** organizations.status -- 'created'/'active' since 202608260001, 'suspended' added by
 * 202609050016_organization_status_control.sql. See services/organizations.ts and
 * services/platform-operations.ts's suspendOrganization/reinstateOrganization. */
export type OrganizationStatus = "created" | "active" | "suspended";

export type OrganizationMemberRecord = {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  invitedBy: string | null;
  joinedAt: string;
  suspendedAt: string | null;
  removedAt: string | null;
  updatedAt: string;
  username: string;
  displayName: string;
  email: string | null;
};

export type OrganizationInvitationRecord = {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
  message: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** An invitation surfaced to the invitee themselves (list_my_pending_invitations), not to
 * an org admin -- includes the organization's name, which the invitee has no other RLS
 * path to read before they're actually a member. */
export type PendingInvitationForUser = {
  id: string;
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export type OrganizationAuditEventRecord = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

/** One real severity x status combination and its count -- see
 * get_organization_severity_status_breakdown. Zero-count combinations are simply absent
 * from the array, never a fabricated zero row. `severity` is null for a report with no
 * organization-confirmed severity yet (matches ReportSummary's own confirmedSeverity). */
export type OrganizationSeverityStatusCount = {
  severity: ReportSeverity | null;
  status: ReportStatus;
  count: number;
};

/** One week's real submission/closure activity -- see
 * get_organization_weekly_report_volume. Always exactly 12 rows (the trailing 12 weeks,
 * oldest first), including weeks with every count at 0, so a chart never has to fabricate
 * a gap in the x-axis. */
export type OrganizationWeeklyReportVolume = {
  weekStart: string;
  submittedCount: number;
  resolvedCount: number;
  otherClosedCount: number;
};

/** Real resolution-performance metrics -- see get_organization_resolution_performance.
 * The two medians are null (never a fabricated 0) when there is no qualifying data yet --
 * e.g. no report in this organization has ever reached triage, or none has ever closed. */
export type OrganizationResolutionPerformance = {
  medianHoursToFirstTriage: number | null;
  medianDaysToResolution: number | null;
  openCount: number;
  aging0To7DaysCount: number;
  aging8To30DaysCount: number;
  aging31To60DaysCount: number;
  agingOver60DaysCount: number;
};

/** Real, finalized bounty spend for one currency -- see get_organization_bounty_spend_
 * summary. Only `state = 'finalized'` decisions count (a 'calculated' recommendation is
 * not money paid). One row per currency actually used; an organization that has never
 * finalized a payout has no rows at all, never a fabricated $0 row. Never sum
 * totalPaidMinorUnits across rows -- each is a different currency. */
export type OrganizationBountySpendSummary = {
  currency: string;
  /** Finalized bounty awards. */
  totalAwardedMinorUnits: number;
  /** Money actually sent: succeeded payment obligations (202610060008). */
  totalPaidMinorUnits: number;
  /** Owed but not yet sent: pending, processing or failed obligations. */
  totalOutstandingMinorUnits: number;
  awardCount: number;
  paidCriticalCount: number;
  paidHighCount: number;
  paidMediumCount: number;
  paidLowCount: number;
  paidNoneCount: number;
};

/** One (week, currency) real payout total -- see get_organization_weekly_bounty_spend.
 * Only currencies with at least one finalized payout in the trailing 12 weeks appear;
 * every week in that window is present for each such currency (zero-payout weeks
 * included), so a chart never has to fabricate a gap. Keyed by finalized_at, not
 * calculated_at/created_at. */
export type OrganizationWeeklyBountySpend = {
  weekStart: string;
  currency: string;
  paidMinorUnits: number;
  payoutCount: number;
};

/** One (program, currency) real spend total -- see get_organization_program_bounty_spend.
 * A program with zero finalized payouts is simply absent, never a fabricated zero row. */
export type OrganizationProgramBountySpend = {
  programId: string;
  currency: string;
  totalPaidMinorUnits: number;
  payoutCount: number;
};

/** One (program, researcher) relationship this researcher currently has for one of this
 * organization's programs -- every relationship is preserved as its own entry, never
 * collapsed. See list_researchers_for_organization. */
export type OrganizationResearcherProgramRelationship = {
  programId: string;
  programName: string;
  status: ProgramResearcherStatus;
};

/** One researcher this organization has ever had a program_researchers relationship with,
 * across every program the org owns -- see list_researchers_for_organization
 * (supabase/migrations/202609060002_organization_researcher_intelligence.sql). Distinct
 * from both the per-program researcher roster (access/status management for one program)
 * and platform-wide reputation (services/reputation.ts, never organization-specific).
 *
 * resolved* counts only reports.status = 'resolved' -- 'accepted' is not terminal and
 * represents a still-in-motion report, not a finalized security contribution.
 * resolvedNone includes both an explicit confirmed_severity = 'none' and a report that
 * reached 'resolved' with no severity ever set (resolve_report never requires severity to
 * be set first). No payment/spend, no platform reputation/score/rank, no email/username --
 * deliberately excluded from this view. */
export type OrganizationResearcherContribution = {
  researcherId: string;
  displayName: string;
  /** @username (202610300006): tells same-named researchers apart, and is what an invite takes. */
  username?: string | null;
  programs: OrganizationResearcherProgramRelationship[];
  resolvedCount: number;
  resolvedCritical: number;
  resolvedHigh: number;
  resolvedMedium: number;
  resolvedLow: number;
  resolvedNone: number;
  lastSubmittedAt: string | null;
};
