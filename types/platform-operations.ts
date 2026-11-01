import type { ProgramType, EngagementType, ProgramStatus, ProgramVisibility } from "@/types/program";

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
 * now platform-admin-only, so this is the real queue an admin approves or rejects from.
 * programType/engagementType/visibility/requiresKyc/focusAreas/scopeEntryCount are the
 * real fields an admin needs to actually judge a launch (not just its free-text
 * description) -- all already stored on public.programs / program_scope_entries, added
 * here rather than inventing new review criteria. */
export type ProgramPendingReview = {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  organizationName: string;
  submittedAt: string;
  programType: ProgramType;
  engagementType: EngagementType;
  visibility: ProgramVisibility;
  requiresKyc: boolean;
  focusAreas: string[];
  scopeEntryCount: number;
};

/** An organization currently suspended platform-wide -- list_suspended_organizations_for_admin.
 * See supabase/migrations/202609050016_organization_status_control.sql and
 * 202609050017_organization_operability_gate.sql. */
export type SuspendedOrganization = {
  id: string;
  name: string;
  suspendedAt: string;
};

/** One row of the platform-wide program directory (list_programs_for_admin, see
 * db/migrations/202609250003_platform_program_oversight.sql). */
export type AdminProgramRow = {
  id: string;
  name: string;
  status: ProgramStatus;
  visibility: ProgramVisibility;
  programType: ProgramType;
  engagementType: EngagementType;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

/** One grouped error (list_app_error_groups_for_admin, 202609250008). */
export type AppErrorGroup = {
  fingerprint: string;
  source: "server" | "client";
  message: string;
  stack: string | null;
  route: string | null;
  occurrences: number;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
};

/** One row of the platform audit log (list_audit_logs_for_admin, see
 * db/migrations/202610010001_delete_researcher_and_audit_log_viewer.sql). audit_logs
 * itself has existed since 202608250001 -- this is just the first read path over it. */
export type AuditLogEntry = {
  id: string;
  actorId: string | null;
  actorDisplayName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
