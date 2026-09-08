import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { activateProgram } from "@/services/programs";
import type {
  NeedsRecoveryNotificationDelivery,
  NeedsRecoveryOutboxEvent,
  NeedsRecoveryPaymentAttempt,
  ProgramPendingReview,
  SuspendedOrganization,
  SuspendedResearcher,
} from "@/types/platform-operations";
import type { ProgramSummary } from "@/types/program";

/** Self-check only -- never another user's platform-admin status. Safe to call before
 * the caller is known to be a platform admin, since it just answers "am I one." */
export async function isPlatformAdmin(): Promise<boolean> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ am_i_platform_admin: boolean }>(client, "public.am_i_platform_admin"));
    return rows[0]?.am_i_platform_admin === true;
  } catch {
    return false; // Fails closed: an error here must never be treated as "yes."
  }
}

type OutboxRow = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  organization_id: string;
  organization_name: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  occurred_at: string;
  processed_at: string | null;
};

function mapOutboxRow(row: OutboxRow): NeedsRecoveryOutboxEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    occurredAt: row.occurred_at,
    processedAt: row.processed_at,
  };
}

/** Every RPC below is SECURITY DEFINER and independently re-checks platform-admin
 * authority itself -- a non-admin caller gets a real FORBIDDEN rejection from the
 * database, not an empty list that could be mistaken for "no failures." */
export async function listNeedsRecoveryOutboxEvents(): Promise<NeedsRecoveryOutboxEvent[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<OutboxRow>(client, "public.list_needs_recovery_outbox_events"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapOutboxRow);
}

type NotificationDeliveryRow = {
  id: string;
  notification_id: string;
  notification_type: string;
  organization_id: string;
  organization_name: string;
  program_id: string;
  program_name: string;
  report_id: string;
  provider_reference: string | null;
  last_error: string | null;
  attempts: number;
  max_attempts: number;
  updated_at: string;
};

function mapNotificationDeliveryRow(row: NotificationDeliveryRow): NeedsRecoveryNotificationDelivery {
  return {
    id: row.id,
    notificationId: row.notification_id,
    notificationType: row.notification_type,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    programId: row.program_id,
    programName: row.program_name,
    reportId: row.report_id,
    providerReference: row.provider_reference,
    lastError: row.last_error,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    updatedAt: row.updated_at,
  };
}

export async function listNeedsRecoveryNotificationDeliveries(): Promise<NeedsRecoveryNotificationDelivery[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<NotificationDeliveryRow>(client, "public.list_needs_recovery_notification_deliveries"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapNotificationDeliveryRow);
}

type PaymentAttemptRow = {
  id: string;
  payment_obligation_id: string;
  organization_id: string;
  organization_name: string;
  program_id: string;
  program_name: string;
  report_id: string;
  provider: string;
  failure_code: string | null;
  failure_message: string | null;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
};

function mapPaymentAttemptRow(row: PaymentAttemptRow): NeedsRecoveryPaymentAttempt {
  return {
    id: row.id,
    paymentObligationId: row.payment_obligation_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    programId: row.program_id,
    programName: row.program_name,
    reportId: row.report_id,
    provider: row.provider,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    attemptNumber: row.attempt_number,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function listNeedsRecoveryPaymentAttempts(): Promise<NeedsRecoveryPaymentAttempt[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PaymentAttemptRow>(client, "public.list_needs_recovery_payment_attempts"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapPaymentAttemptRow);
}

/** The one recovery action this slice offers -- resets a dead-lettered outbox event back
 * to 'pending' so the existing, unmodified worker claim/complete loop reprocesses it
 * naturally. Notification-delivery and payment failures have no equivalent function:
 * see the migration's own comment for why neither has an existing safe retry path yet. */
export async function replayDeadLetteredOutboxEvent(eventId: string, reason?: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.replay_dead_lettered_outbox_event", [eventId, reason ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// --- Program-launch review gate (see db/migrations/202609050013_program_launch_review_gate.sql) ---

type ProgramPendingReviewRow = {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  organization_name: string;
  submitted_at: string;
};

function mapProgramPendingReviewRow(row: ProgramPendingReviewRow): ProgramPendingReview {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    submittedAt: row.submitted_at,
  };
}

export async function listProgramsPendingReviewForAdmin(): Promise<ProgramPendingReview[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ProgramPendingReviewRow>(client, "public.list_programs_pending_review_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapProgramPendingReviewRow);
}

/** activate_program's own authorization changed (platform-admin-only, 202609050013) but its
 * shape did not -- reuse services/programs.ts's existing wrapper rather than duplicating it. */
export async function approveProgramLaunch(programId: string): Promise<ProgramSummary> {
  return activateProgram(programId);
}

export async function rejectProgramLaunch(programId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.reject_program_launch", [programId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// --- Cross-program researcher suspension (see db/migrations/202609050014_researcher_platform_suspension.sql) ---

type SuspendedResearcherRow = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  suspended_at: string;
};

function mapSuspendedResearcherRow(row: SuspendedResearcherRow): SuspendedResearcher {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    suspendedAt: row.suspended_at,
  };
}

export async function listSuspendedResearchersForAdmin(): Promise<SuspendedResearcher[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<SuspendedResearcherRow>(client, "public.list_suspended_researchers_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapSuspendedResearcherRow);
}

/** target is resolved server-side by suspend_researcher_platform_wide's own caller -- this
 * function takes a real user id, not a username; see actions/platform-operations.ts's
 * suspendResearcherAction for how a username is resolved to that id before calling here. */
export async function suspendResearcherPlatformWide(userId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.suspend_researcher_platform_wide", [userId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function reinstateResearcherPlatformWide(userId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.reinstate_researcher_platform_wide", [userId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/**
 * Resolves a username to a user id -- the lookup a platform admin needs before suspending a
 * researcher who is not otherwise in a list. No RPC in this schema exposes a general
 * username->id lookup (add_report_collaborator resolves a username internally, inside its own
 * SECURITY DEFINER body, rather than exposing a separate lookup call; `users` RLS otherwise
 * only permits reading your own row or a real co-member's), so there is no RLS-scoped path
 * for an admin, who is neither, to read an arbitrary username.
 *
 * This is therefore a real, narrow, disclosed exception, the same shape services/reports.ts's
 * own listReportsForActor documents for the bearer-token path: service_role bypasses RLS
 * (BYPASSRLS, see db/migrations/000000000001_native_auth_shim.sql), but ONLY after this
 * module's own caller has already independently verified `isPlatformAdmin()` via its RPC
 * self-check (never skip that call before reaching here), and only to read the two columns
 * needed to act -- never a general "read any user" capability, and never called from
 * anywhere a caller's admin status has not just been confirmed. Deliberately kept on
 * withServiceRoleTransaction rather than withActorTransaction: authenticated DOES have a
 * table-level SELECT grant on public.users, but no RLS policy here covers a platform
 * admin looking up an arbitrary username -- using withActorTransaction would silently
 * widen this to "any authenticated user can look up any username," since a plain GRANT
 * has no row-level narrowing on its own the way RLS does.
 */
export async function findUserIdByUsername(username: string): Promise<{ id: string; isSuspended: boolean } | null> {
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) =>
      client.query<{ id: string; is_suspended: boolean }>("select id, is_suspended from public.users where username = $1", [username]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return row ? { id: row.id, isSuspended: row.is_suspended } : null;
}

// --- Org-status control (see db/migrations/202609050016_organization_status_control.sql
// and 202609050017_organization_operability_gate.sql) ---

type SuspendedOrganizationRow = { id: string; name: string; suspended_at: string };

function mapSuspendedOrganizationRow(row: SuspendedOrganizationRow): SuspendedOrganization {
  return { id: row.id, name: row.name, suspendedAt: row.suspended_at };
}

export async function listSuspendedOrganizationsForAdmin(): Promise<SuspendedOrganization[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<SuspendedOrganizationRow>(client, "public.list_suspended_organizations_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapSuspendedOrganizationRow);
}

export async function suspendOrganization(organizationId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.suspend_organization", [organizationId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function reinstateOrganization(organizationId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.reinstate_organization", [organizationId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/**
 * Resolves an organization's slug to its id -- the lookup a platform admin needs before
 * suspending an organization that is not otherwise in a list. `organizations` RLS only
 * permits reading an organization you belong to (services/organizations.ts has no
 * slug-lookup function for exactly that reason), so this is the same real, narrow,
 * disclosed service-role exception as findUserIdByUsername above -- read the full
 * comment there.
 */
export async function findOrganizationIdBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) =>
      client.query<{ id: string; name: string }>("select id, name from public.organizations where slug = $1", [slug]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return row ? { id: row.id, name: row.name } : null;
}
