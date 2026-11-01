import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import { activateProgram } from "@/services/programs";
import type {
  NeedsRecoveryNotificationDelivery,
  NeedsRecoveryOutboxEvent,
  NeedsRecoveryPaymentAttempt,
  AdminProgramRow,
  AppErrorGroup,
  AuditLogEntry,
  ProgramPendingReview,
  SuspendedOrganization,
} from "@/types/platform-operations";
import type { ProgramSummary, ProgramStatus, ProgramType, EngagementType, ProgramVisibility } from "@/types/program";

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
  program_type: ProgramType;
  engagement_type: EngagementType;
  visibility: ProgramVisibility;
  requires_kyc: boolean;
  focus_areas: string[];
  scope_entry_count: string | number;
};

function mapProgramPendingReviewRow(row: ProgramPendingReviewRow): ProgramPendingReview {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    submittedAt: row.submitted_at,
    programType: row.program_type,
    engagementType: row.engagement_type,
    visibility: row.visibility,
    requiresKyc: row.requires_kyc,
    focusAreas: row.focus_areas ?? [],
    scopeEntryCount: Number(row.scope_entry_count),
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

/** reject_program_launch's own RPC already returns the full updated `public.programs` row
 * (db/migrations/202609050013_program_launch_review_gate.sql) -- returning organization_id
 * here (not discarding it as `Promise<void>` previously did) is what lets the caller
 * revalidate the org's own program page after a reject, not just /platform/programs. */
export async function rejectProgramLaunch(programId: string, reason: string): Promise<{ organizationId: string }> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ organization_id: string }>(client, "public.reject_program_launch", [programId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return { organizationId: rows[0].organization_id };
}

// --- Cross-program researcher suspension (see db/migrations/202609050014_researcher_platform_suspension.sql) ---

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

export type AdminAccountMatch = { id: string; username: string; displayName: string; email: string | null; isSuspended: boolean; deactivatedAt: string | null };

/** Researchers matching a username / name / email fragment, for the admin forms' search
 * box (db/migrations/202610090002_admin_account_search.sql). Platform admins only. */
export async function searchAccountsForAdmin(query: string, onlyDeactivated = false): Promise<AdminAccountMatch[]> {
  const actor = await getCurrentUser();
  let rows: { id: string; username: string; display_name: string; email: string | null; is_suspended: boolean; deactivated_at: string | null }[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.search_accounts_for_admin", [query, onlyDeactivated]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, username: row.username, displayName: row.display_name, email: row.email, isSuspended: row.is_suspended, deactivatedAt: row.deactivated_at }));
}

export type AdminOrganizationMatch = { id: string; slug: string; name: string; status: string; ownerEmail: string | null; memberCount: number };

/** Organizations matching a name / slug / owner-email fragment, for the admin suspend
 * form's search box (db/migrations/202610090003_admin_organization_search.sql). */
export async function searchOrganizationsForAdmin(query: string): Promise<AdminOrganizationMatch[]> {
  const actor = await getCurrentUser();
  let rows: { id: string; slug: string; name: string; status: string; owner_email: string | null; member_count: number }[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.search_organizations_for_admin", [query]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, status: row.status, ownerEmail: row.owner_email, memberCount: row.member_count }));
}

/** Undoes a self-service deactivation (deactivate_my_account) -- the "contact support"
 * path the deactivation page promises. Refused for an account a platform admin deleted
 * (see db/migrations/202610090001_reactivate_account.sql). */
export async function reactivateAccountPlatformWide(email: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.reactivate_account_platform_wide", [email, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Irreversible: scrubs the account's PII and blocks sign-in forever (reuses
 * users.deactivated_at, the same column a self-service deactivation sets -- see
 * db/migrations/202610010001_delete_researcher_and_audit_log_viewer.sql for why a real row
 * delete is impossible once a researcher has any report/payout/reputation history). */
export async function deleteResearcherPlatformWide(userId: string, reason: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.delete_researcher_platform_wide", [userId, reason]));
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

// --- Platform program oversight (see db/migrations/202609250003_platform_program_oversight.sql) ---

type AdminProgramDbRow = {
  id: string;
  name: string;
  status: ProgramStatus;
  visibility: ProgramVisibility;
  program_type: ProgramType;
  engagement_type: EngagementType;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  report_count: string;
  created_at: string;
  updated_at: string;
};

/** Counts and list run in one transaction -- one round trip's worth of setup for a page
 * that always needs both. */
export async function getProgramDirectoryForAdmin(filters: { search?: string; status?: ProgramStatus }): Promise<{ counts: Partial<Record<ProgramStatus, number>>; programs: AdminProgramRow[] }> {
  const actor = await getCurrentUser();
  let result;
  try {
    result = await withActorTransaction(actor?.id ?? null, async (client) => ({
      counts: await callRpc<{ status: ProgramStatus; program_count: string }>(client, "public.get_platform_program_status_counts"),
      programs: await callRpc<AdminProgramDbRow>(client, "public.list_programs_for_admin", [filters.search ?? null, filters.status ?? null]),
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
  return {
    counts: Object.fromEntries(result.counts.map((row) => [row.status, Number(row.program_count)])),
    programs: result.programs.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      visibility: row.visibility,
      programType: row.program_type,
      engagementType: row.engagement_type,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationSlug: row.organization_slug,
      reportCount: Number(row.report_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

export async function suspendProgram(programId: string, reason: string): Promise<{ organizationId: string }> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ organization_id: string }>(client, "public.suspend_program", [programId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return { organizationId: rows[0].organization_id };
}

export async function reinstateProgram(programId: string, reason: string): Promise<{ organizationId: string }> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ organization_id: string }>(client, "public.reinstate_program", [programId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return { organizationId: rows[0].organization_id };
}

// --- In-house error tracking (db/migrations/202609250008_app_errors.sql) ---

type AppErrorGroupRow = {
  fingerprint: string;
  source: "server" | "client";
  message: string;
  stack: string | null;
  route: string | null;
  occurrences: string;
  affected_users: string;
  first_seen: string;
  last_seen: string;
};

export async function listAppErrorGroupsForAdmin(sinceDays: number): Promise<AppErrorGroup[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<AppErrorGroupRow>(client, "public.list_app_error_groups_for_admin", [`${sinceDays} days`]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    fingerprint: row.fingerprint,
    source: row.source,
    message: row.message,
    stack: row.stack,
    route: row.route,
    occurrences: Number(row.occurrences),
    affectedUsers: Number(row.affected_users),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));
}

// --- Platform audit log (db/migrations/202610010001_delete_researcher_and_audit_log_viewer.sql) ---

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_display_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function listAuditLogsForAdmin(options?: { limit?: number; before?: string }): Promise<AuditLogEntry[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<AuditLogRow>(client, "public.list_audit_logs_for_admin", [options?.limit ?? 100, options?.before ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorDisplayName: row.actor_display_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

/** Every account a platform admin can restore, searchable by name, username or email:
 * suspended (Reinstate) and self-deactivated (Reactivate). Admin-deleted accounts are left
 * out because they can't be reactivated (list_restricted_accounts_for_admin, 202610190005). */
export type RestrictedAccount = { id: string; username: string; displayName: string; email: string | null; accountType: string; state: "suspended" | "deactivated"; since: string | null };

export async function listRestrictedAccountsForAdmin(query: string): Promise<RestrictedAccount[]> {
  const actor = await getCurrentUser();
  type Row = { id: string; username: string; display_name: string; email: string | null; account_type: string; state: RestrictedAccount["state"]; since: string | null };
  let rows: Row[];
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Row>(client, "public.list_restricted_accounts_for_admin", [query.trim() || null, 100]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, email: r.email, accountType: r.account_type, state: r.state, since: r.since ? new Date(r.since).toISOString() : null }));
}
