/** Never a report title/description/evidence/message, never a bounty or payment amount,
 * never a recipient's identity -- exactly the failure metadata needed to locate and
 * describe a problem. See docs/decisions/0027-platform-operations-foundation.md. */
export type NeedsRecoveryOutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  organizationId: string;
  organizationName: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  occurredAt: string;
  processedAt: string | null;
};

export type NeedsRecoveryNotificationDelivery = {
  id: string;
  notificationId: string;
  notificationType: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  programName: string;
  reportId: string;
  providerReference: string | null;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  updatedAt: string;
};

export type NeedsRecoveryPaymentAttempt = {
  id: string;
  paymentObligationId: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  programName: string;
  reportId: string;
  provider: string;
  failureCode: string | null;
  failureMessage: string | null;
  attemptNumber: number;
  startedAt: string;
  completedAt: string | null;
};

/** A program awaiting platform-admin launch review -- list_programs_pending_review_for_admin.
 * See supabase/migrations/202609050013_program_launch_review_gate.sql: activate_program is
 * now platform-admin-only, so this is the real queue an admin approves or rejects from. */
export type ProgramPendingReview = {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  organizationName: string;
  submittedAt: string;
};

/** A researcher currently suspended platform-wide -- list_suspended_researchers_for_admin.
 * See supabase/migrations/202609050014_researcher_platform_suspension.sql. */
export type SuspendedResearcher = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  suspendedAt: string;
};

/** An organization currently suspended platform-wide -- list_suspended_organizations_for_admin.
 * See supabase/migrations/202609050016_organization_status_control.sql and
 * 202609050017_organization_operability_gate.sql. */
export type SuspendedOrganization = {
  id: string;
  name: string;
  suspendedAt: string;
};
