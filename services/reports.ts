import "server-only";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import { REPORT_STATUS_TRANSITIONS } from "@/lib/report-status";
import type { ProgramAssetType } from "@/types/scope";
import type {
  CvssMetrics,
  Report,
  ReportCollaborator,
  ReportEvidence,
  ReportEvidenceType,
  ReportInboxWorkloadSummary,
  ReportMediation,
  ReportMediationReason,
  ReportMediationStatus,
  ReportMessage,
  ReportRetest,
  ReportRetestStatus,
  ReportSeverity,
  ReportStatus,
  ReportSummary,
  ReportVisibility,
  ReportWeaknessType,
} from "@/types/report";
import type { OrganizationAuditEventRecord } from "@/types/organization";
import type { Page } from "@/types/pagination";

export { OrganizationServiceError };

const REPORT_SELECT_COLUMNS =
  "r.id, r.program_id, r.organization_id, r.researcher_id, r.title, r.description, r.asset_type, r.target, r.display_target, r.matched_scope_entry_id, r.matched_scope_state, r.matched_target, r.status, r.confirmed_severity, r.duplicate_of_report_id, r.resolution_summary, r.weakness_type, r.impact, r.researcher_severity, r.cvss_attack_vector, r.cvss_attack_complexity, r.cvss_privileges_required, r.cvss_user_interaction, r.cvss_scope, r.cvss_confidentiality_impact, r.cvss_integrity_impact, r.cvss_availability_impact, r.cvss_base_score, r.submitted_at, r.created_at, r.updated_at, u.display_name as researcher_display_name, r.assignee_id, a.display_name as assignee_display_name";

type ReportRow = {
  id: string;
  program_id: string;
  organization_id: string;
  researcher_id: string;
  title: string;
  description: string;
  asset_type: ProgramAssetType;
  target: string;
  display_target: string;
  matched_scope_entry_id: string | null;
  matched_scope_state: Report["matchedScopeState"];
  matched_target: string;
  status: ReportStatus;
  confirmed_severity: ReportSeverity | null;
  duplicate_of_report_id: string | null;
  resolution_summary: string | null;
  weakness_type: ReportWeaknessType | null;
  impact: string | null;
  researcher_severity: ReportSeverity | null;
  cvss_attack_vector: string | null;
  cvss_attack_complexity: string | null;
  cvss_privileges_required: string | null;
  cvss_user_interaction: string | null;
  cvss_scope: string | null;
  cvss_confidentiality_impact: string | null;
  cvss_integrity_impact: string | null;
  cvss_availability_impact: string | null;
  cvss_base_score: number | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  researcher_display_name: string | null;
  assignee_id: string | null;
  assignee_display_name: string | null;
};

/** All eight CVSS columns are stored all-or-nothing (see the schema's own check
 * constraint) -- a partial set never occurs in practice, but this reads defensively
 * rather than assuming, the same way private.calculate_cvss_base_score does. */
function mapCvssMetrics(row: ReportRow): Report["cvssMetrics"] {
  if (
    !row.cvss_attack_vector || !row.cvss_attack_complexity || !row.cvss_privileges_required || !row.cvss_user_interaction ||
    !row.cvss_scope || !row.cvss_confidentiality_impact || !row.cvss_integrity_impact || !row.cvss_availability_impact
  ) {
    return null;
  }
  return {
    attackVector: row.cvss_attack_vector as CvssMetrics["attackVector"],
    attackComplexity: row.cvss_attack_complexity as CvssMetrics["attackComplexity"],
    privilegesRequired: row.cvss_privileges_required as CvssMetrics["privilegesRequired"],
    userInteraction: row.cvss_user_interaction as CvssMetrics["userInteraction"],
    scope: row.cvss_scope as CvssMetrics["scope"],
    confidentialityImpact: row.cvss_confidentiality_impact as CvssMetrics["confidentialityImpact"],
    integrityImpact: row.cvss_integrity_impact as CvssMetrics["integrityImpact"],
    availabilityImpact: row.cvss_availability_impact as CvssMetrics["availabilityImpact"],
  };
}

function mapReportRow(row: ReportRow): Report {
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    researcherId: row.researcher_id,
    researcherName: row.researcher_display_name ?? "Deactivated account",
    title: row.title,
    description: row.description,
    assetType: row.asset_type,
    target: row.target,
    displayTarget: row.display_target,
    matchedScopeEntryId: row.matched_scope_entry_id,
    matchedScopeState: row.matched_scope_state,
    matchedTarget: row.matched_target,
    status: row.status,
    confirmedSeverity: row.confirmed_severity,
    duplicateOfReportId: row.duplicate_of_report_id,
    resolutionSummary: row.resolution_summary,
    weaknessType: row.weakness_type,
    impact: row.impact,
    researcherSeverity: row.researcher_severity,
    cvssMetrics: mapCvssMetrics(row),
    cvssBaseScore: row.cvss_base_score,
    assigneeId: row.assignee_id ?? null,
    assigneeName: row.assignee_display_name ?? null,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type ReportRpcRow = Omit<ReportRow, "researcher_display_name" | "assignee_display_name">;
function mapReportRpcResult(row: ReportRpcRow): Report {
  return mapReportRow({ ...row, researcher_display_name: null, assignee_display_name: null });
}

/**
 * `targetInput` is sent to the database exactly as the researcher typed it --
 * canonicalization and scope matching happen in exactly one place
 * (private.canonicalize_scope_target / private.match_program_scope, 202608270001),
 * never duplicated here. See docs/decisions/0008-report-authorization-and-scope-snapshot.md.
 */
export async function submitReport(
  programId: string,
  assetType: ProgramAssetType,
  targetInput: string,
  title: string,
  description: string,
  weaknessType: ReportWeaknessType,
  impact: string,
  researcherSeverity?: ReportSeverity,
  acknowledgedPolicyVersion: number | null = null,
): Promise<Report> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, async (client) => {
      // Read by the reports insert trigger in this same transaction (202610060009).
      await client.query("select set_config('app.acknowledged_policy_version', $1, true)", [acknowledgedPolicyVersion?.toString() ?? ""]);
      return callRpc<ReportRpcRow>(client, "public.submit_report", [programId, assetType, targetInput, title, description, weaknessType, impact, researcherSeverity ?? null]);
    });
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportRpcResult(rows[0]);
}

/** A single report -- RLS decides visibility (the submitting researcher, an org owner/
 * security admin, or a program manager). A null result covers "does not exist" and
 * "exists but you have no access" identically, the same as every other detail read in
 * this codebase. */
export async function getReport(reportId: string): Promise<Report | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<ReportRow>(`select ${REPORT_SELECT_COLUMNS} from public.reports r left join public.users u on u.id = r.researcher_id left join public.users a on a.id = r.assignee_id where r.id = $1`, [reportId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapReportRow(rows[0]) : null;
}

/** assignee: "me", "unassigned", or a staff member's user id (202610060011). */
export type ReportInboxFilters = { status?: ReportStatus; severity?: ReportSeverity; assignee?: string };

function pushAssigneeCondition(filters: ReportInboxFilters | undefined, actorId: string | null, conditions: string[], params: unknown[]) {
  if (!filters?.assignee) return;
  if (filters.assignee === "unassigned") {
    conditions.push("r.assignee_id is null");
    return;
  }
  params.push(filters.assignee === "me" ? actorId : filters.assignee);
  conditions.push(`r.assignee_id = $${params.length}`);
}

/** Manager-facing report inbox for one program -- RLS already scopes this to managers/
 * org admins; a plain researcher querying this never reaches a page that calls it.
 * Status/severity filters are applied server-side (a real WHERE predicate before the
 * cursor filter), never fetched-then-filtered in React -- the whole point of a
 * database-backed filter is that the caller only ever receives rows that match.
 * Keyset-paginated on `submitted_at` (the existing `reports_program_id_idx
 * (program_id, submitted_at desc)` already supports this predicate/ordering with no new
 * index needed). A single-column cursor, not a composite `(submitted_at, id)` one --
 * timestamptz has microsecond precision, so a same-instant tie across two reports in the
 * same program is practically negligible; accepted as a documented simplification rather
 * than adding filter complexity for a real-world-irrelevant edge case. */
export async function listReportsForProgram(programId: string, cursor?: string, limit?: number, filters?: ReportInboxFilters): Promise<Page<Report>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;

  const conditions = ["r.program_id = $1"];
  const params: unknown[] = [programId];
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (filters?.severity) {
    params.push(filters.severity);
    conditions.push(`r.confirmed_severity = $${params.length}`);
  }
  pushAssigneeCondition(filters, actor?.id ?? null, conditions, params);
  if (decoded) {
    params.push(decoded.sortValue);
    conditions.push(`r.submitted_at < $${params.length}`);
  }
  params.push(pageSize);

  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportRow>(
          `select ${REPORT_SELECT_COLUMNS} from public.reports r left join public.users u on u.id = r.researcher_id left join public.users a on a.id = r.assignee_id
           where ${conditions.join(" and ")} order by r.submitted_at desc limit $${params.length}`,
          params,
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapReportRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].submitted_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

export type OrganizationReportFilters = ReportInboxFilters & {
  programId?: string;
  /** Matches title, target, report number or the researcher's username (case-insensitive). */
  query?: string;
  /** newest (default) or oldest submitted first. */
  sort?: "newest" | "oldest";
};

/** Findings: every report across every one of an organization's engagements, one flat
 * list -- the cross-program counterpart to listReportsForProgram above (identical
 * filter/cursor/RLS shape, only the scoping predicate differs: organization_id instead of
 * program_id, plus an optional programId filter to narrow to one engagement without
 * leaving this view). RLS narrows the same way listOpenReportsForOrganization already
 * documents: an org owner/security_admin's has_org_role check passes for every row in the
 * organization, a program manager's is_program_member(program_id) check passes only for
 * rows belonging to programs they actually manage. Unlike listOpenReportsForOrganization
 * (a bounded, unfiltered "what's open right now" snapshot for the Home page), this is a
 * real paginated, filterable surface -- every status, not just the open ones. */
export async function listReportsForOrganization(organizationId: string, cursor?: string, limit?: number, filters?: OrganizationReportFilters): Promise<Page<Report>> {
  const actor = await getCurrentUser();
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;

  const conditions = ["r.organization_id = $1"];
  const params: unknown[] = [organizationId];
  if (filters?.programId) {
    params.push(filters.programId);
    conditions.push(`r.program_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (filters?.severity) {
    params.push(filters.severity);
    conditions.push(`r.confirmed_severity = $${params.length}`);
  }
  pushAssigneeCondition(filters, actor?.id ?? null, conditions, params);
  const query = filters?.query?.trim().slice(0, 100);
  if (query) {
    // Escaped for ILIKE so % and _ typed in a search are literal characters.
    params.push(`%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    const seq = /^#?\d+$/.test(query) ? ` or r.submission_seq = ${Number(query.replace("#", ""))}` : "";
    conditions.push(`(r.title ilike ${p} or r.display_target ilike ${p} or u.username ilike ${p}${seq})`);
  }
  const oldestFirst = filters?.sort === "oldest";
  if (decoded) {
    params.push(decoded.sortValue);
    conditions.push(`r.submitted_at ${oldestFirst ? ">" : "<"} $${params.length}`);
  }
  params.push(pageSize);

  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportRow>(
          `select ${REPORT_SELECT_COLUMNS} from public.reports r left join public.users u on u.id = r.researcher_id left join public.users a on a.id = r.assignee_id
           where ${conditions.join(" and ")} order by r.submitted_at ${oldestFirst ? "asc" : "desc"} limit $${params.length}`,
          params,
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapReportRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].submitted_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

const OPEN_REPORT_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted"];
export const OPEN_REPORTS_OVERVIEW_LIMIT = 200;

/** A bounded snapshot of every currently-open (non-terminal) report across an entire
 * organization -- for the operations overview only, never a second pagination contract.
 * RLS on `reports` already scopes this correctly per viewer without any special-casing
 * here: an org owner/security_admin's `has_org_role` check passes for every row in the
 * organization, while a program manager's `is_program_member(program_id)` check passes
 * only for rows belonging to programs they actually manage -- the same "one query, RLS
 * narrows it per viewer" pattern listReportsForProgram already documents. Capped at
 * `OPEN_REPORTS_OVERVIEW_LIMIT`; the caller must treat a result at exactly that length as
 * "200+", never as an exact total, since this is a snapshot for triage prioritization, not
 * a counted report. */
export async function listOpenReportsForOrganization(organizationId: string): Promise<Report[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportRow>(
          `select ${REPORT_SELECT_COLUMNS} from public.reports r left join public.users u on u.id = r.researcher_id left join public.users a on a.id = r.assignee_id
           where r.organization_id = $1 and r.status = any($2) order by r.updated_at desc limit $3`,
          [organizationId, OPEN_REPORT_STATUSES, OPEN_REPORTS_OVERVIEW_LIMIT],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportRow);
}

/** The triage inbox's own workload-at-a-glance counts -- three cheap `count(*)` queries
 * (matching the same RLS-scoped `reports` table the inbox itself reads), run in
 * parallel. `unresolvedHighSeverityCount` reuses OPEN_REPORT_STATUSES (the same "open"
 * definition listOpenReportsForOrganization already uses) intersected with
 * confirmed_severity in ('high', 'critical') -- never a second, differently-defined
 * notion of "open." This is a summary strip, not a new pagination surface: no cursor, no
 * row data, just three numbers a triager reads before scanning the table below. */
export async function getReportInboxWorkloadSummary(programId: string): Promise<ReportInboxWorkloadSummary> {
  const actor = await getCurrentUser();
  let newCount: number, needsInfoCount: number, highSeverityCount: number;
  try {
    ({ newCount, needsInfoCount, highSeverityCount } = await withActorTransaction(actor?.id ?? null, async (client) => {
      // Sequential, not Promise.all -- these three queries share the single client this
      // withActorTransaction callback was handed. A pg PoolClient can only run one query
      // at a time; firing these concurrently on it throws pg's own "client is already
      // executing a query" deprecation warning (same real bug found and fixed in
      // services/payments.ts's listMyPaymentObligations).
      const newResult = await client.query<{ count: string }>("select count(*) from public.reports where program_id = $1 and status = 'new'", [programId]);
      const needsInfoResult = await client.query<{ count: string }>("select count(*) from public.reports where program_id = $1 and status = 'needs_information'", [programId]);
      const highSeverityResult = await client.query<{ count: string }>(
        "select count(*) from public.reports where program_id = $1 and status = any($2) and confirmed_severity = any($3)",
        [programId, OPEN_REPORT_STATUSES, ["high", "critical"]],
      );
      return { newCount: Number(newResult.rows[0].count), needsInfoCount: Number(needsInfoResult.rows[0].count), highSeverityCount: Number(highSeverityResult.rows[0].count) };
    }));
  } catch (error) {
    mapError(error as { message: string });
  }
  return {
    newCount,
    needsInformationCount: needsInfoCount,
    unresolvedHighSeverityCount: highSeverityCount,
  };
}

type MyReportRow = {
  id: string;
  program_id: string;
  organization_id: string;
  program_name: string;
  organization_name: string;
  title: string;
  display_target: string;
  status: ReportSummary["status"];
  // Optional: only list_my_reports (202609050002) returns this column.
  // list_reports_for_actor (the bearer-token API's sibling RPC) does not yet -- see
  // listReportsForActor's own comment for why that surface is deliberately left
  // unchanged by this fix. mapMyReportRow defaults it to null for that caller.
  confirmed_severity?: ReportSummary["confirmedSeverity"];
  submitted_at: string;
};

function mapMyReportRow(row: MyReportRow): ReportSummary {
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    programName: row.program_name,
    organizationName: row.organization_name,
    title: row.title,
    displayTarget: row.display_target,
    status: row.status,
    confirmedSeverity: row.confirmed_severity ?? null,
    submittedAt: row.submitted_at,
  };
}

/** The signed-in researcher's own reports across every program, regardless of their
 * current participation status -- see docs/decisions/0008 for why this is a
 * SECURITY DEFINER RPC rather than a direct embedded query. Keyset-paginated via the RPC
 * itself (list_my_reports gained p_limit/p_before_submitted_at/p_before_id in
 * docs/decisions/0018), which does the composite-tiebreaker comparison correctly in SQL
 * rather than approximating it here. */
export type MyReportFilters = { status?: ReportStatus; programId?: string; severity?: ReportSeverity };

/** The researcher's own reports, newest first, filtered in the database (202610060014) so
 * every page honours the filter -- not just the rows already loaded. */
export async function listMyReports(userId: string, cursor?: string, limit?: number, filters: MyReportFilters = {}): Promise<Page<ReportSummary>> {
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;

  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      callRpc<MyReportRow>(client, "public.list_my_reports", [
        pageSize,
        decoded?.sortValue ?? null,
        decoded?.id ?? null,
        filters.status ?? null,
        filters.programId ?? null,
        filters.severity ?? null,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapMyReportRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].submitted_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

/**
 * The bearer-token-authenticated equivalent of listMyReports -- used ONLY by
 * app/api/v1/reports/route.ts after lib/api-auth.ts's resolveBearerUserId has already
 * verified the token and resolved a real, trusted actorId. Calls list_reports_for_actor
 * (202609030003) via withServiceRoleTransaction, since a bearer-token request has no
 * cookie session for auth.uid() to resolve -- see that migration's own comment for why
 * this is a real, narrow exception rather than a general "read any user" capability.
 * Never call this with a client-supplied id; actorId must always come from a
 * hash-verified token. This RPC is SECURITY INVOKER + service_role-only granted (no
 * authenticated grant exists at all), so withServiceRoleTransaction is required, not
 * optional.
 */
export async function listReportsForActor(actorId: string, cursor?: string, limit?: number): Promise<Page<ReportSummary>> {
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) =>
      callRpc<MyReportRow>(client, "public.list_reports_for_actor", [actorId, pageSize, decoded?.sortValue ?? null, decoded?.id ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapMyReportRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].submitted_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

/** GET /api/v1/reports/:id's detail row -- a bearer-token API caller's own report, one
 * level deeper than listReportsForActor's summary shape (adds description/impact/
 * weaknessType), still never the full internal Report type (no evidence, no messages, no
 * CVSS breakdown -- those are separate concepts with their own authorization, never folded
 * into a report-detail read). */
export type ReportDetailForActor = {
  id: string;
  programId: string;
  organizationId: string;
  programName: string;
  organizationName: string;
  title: string;
  description: string;
  displayTarget: string;
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  weaknessType: ReportWeaknessType | null;
  impact: string | null;
  submittedAt: string;
  updatedAt: string;
};

type ReportDetailForActorRow = {
  id: string;
  program_id: string;
  organization_id: string;
  program_name: string;
  organization_name: string;
  title: string;
  description: string;
  display_target: string;
  status: ReportStatus;
  confirmed_severity: ReportSeverity | null;
  weakness_type: ReportWeaknessType | null;
  impact: string | null;
  submitted_at: string;
  updated_at: string;
};

/** The bearer-token API's report-detail read -- see get_report_for_actor
 * (202609050007), the sibling RPC to list_reports_for_actor, same SECURITY INVOKER +
 * service_role-only shape and the same reason (a bearer-token request has no cookie
 * session for auth.uid() to resolve). Returns null both when the report doesn't exist and
 * when it exists but belongs to a different researcher -- the RPC's own WHERE clause
 * already makes those indistinguishable, matching every other "not found vs. not yours"
 * convention in this codebase. Never call this with a client-supplied actorId. */
export async function getReportForActor(actorId: string, reportId: string): Promise<ReportDetailForActor | null> {
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) => callRpc<ReportDetailForActorRow>(client, "public.get_report_for_actor", [actorId, reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    programId: row.program_id,
    organizationId: row.organization_id,
    programName: row.program_name,
    organizationName: row.organization_name,
    title: row.title,
    description: row.description,
    displayTarget: row.display_target,
    status: row.status,
    confirmedSeverity: row.confirmed_severity,
    weaknessType: row.weakness_type,
    impact: row.impact,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

/** An exact count, never a partial page's `.length` -- still scoped by `reports`' own
 * RLS (`researcher_id = auth.uid()`, no active-participation gate, so this counts every
 * report the researcher has ever submitted, matching "historical access remains"
 * elsewhere in this codebase). Used only for a real, honest "needs your response" signal
 * on the researcher's own home screen -- never a fabricated metric. */
export async function countMyReportsNeedingResponse(userId: string): Promise<number> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ count: string }>("select count(*) from public.reports where researcher_id = $1 and status = 'needs_information'", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return Number(rows[0]?.count ?? 0);
}

/** A true total per status across every report the researcher has ever submitted, never
 * a partial-page tally -- the researcher's own current work mix (in-flight and
 * terminal alike), distinct from the reputation ledger's own outcomes-only history. Same
 * `researcher_id` filter and same reasoning as countMyReportsNeedingResponse. */
export async function getMyReportStatusCounts(userId: string): Promise<{ status: ReportStatus; count: number }[]> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ status: ReportStatus }>("select status from public.reports where researcher_id = $1", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }

  const counts = new Map<ReportStatus, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

// --- Triage mutations (each one a single RPC call into a SECURITY DEFINER function --
// every transition's target status is hardcoded in its own function, never a
// client-supplied parameter. See docs/decisions/0009-report-triage-state-machine.md) ---

/**
 * Phase 5.5 guard layering: services/reports.ts (this file) is the single source of
 * truth for "is this a legal report-status transition," in the sense that every
 * caller -- the action layer (actions/reports.ts), any UI component deciding which
 * button to render -- goes through this function rather than each independently
 * re-deriving the answer from the raw REPORT_STATUS_TRANSITIONS table. That table itself
 * still lives in lib/report-status.ts (not here), for an unavoidable reason: this file is
 * `server-only` and the table is also consumed by client components (report-status-chart)
 * -- moving the DATA here would break those call sites outright. What moves here is the
 * one real DECISION function built on it.
 *
 * This is explicitly NOT a replacement for the database's own enforcement --
 * private.is_valid_report_transition (see db/migrations/
 * 202608270002_report_triage_foundation.sql) remains the actual, atomic, race-free
 * authority; every one of the 8 triage RPCs below independently re-validates there
 * regardless of what this function says, and its own rejection (INVALID_TRANSITION)
 * still surfaces correctly through mapError/OrganizationServiceError with zero change
 * needed here. isValidReportTransition is a pure, synchronous, no-I/O function -- calling
 * it does NOT add a query or a race window to any of the 8 mutation functions below (a
 * real pre-flight check would require fetching the report's current status first, an
 * extra round trip on every triage action app-wide for a check the database already
 * makes atomically and correctly -- deliberately not done; see this decision's own
 * rationale). Its practical callers are the UI layer (deciding which action buttons are
 * legal to show, already done via REPORT_STATUS_TRANSITIONS directly at three call sites)
 * and this file's own future/optional defensive assertions, not a gate in front of the
 * RPC call itself.
 */
export function isValidReportTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_STATUS_TRANSITIONS[from].includes(to);
}

/** Throws the identical OrganizationServiceError shape/code (INVALID_TRANSITION) the
 * database itself raises on an illegal transition -- so a caller that already has the
 * report's current status in hand (no extra query needed) can fail fast with the exact
 * same error contract every RPC rejection already produces, before ever reaching the
 * network. Never called automatically inside the 8 mutation functions below (see
 * isValidReportTransition's own comment on why) -- available for a caller that already
 * knows the current status to use explicitly. */
export function assertValidReportTransition(from: ReportStatus, to: ReportStatus): void {
  if (!isValidReportTransition(from, to)) {
    throw new OrganizationServiceError(`this report cannot be transitioned from ${from} to ${to}`, "INVALID_TRANSITION");
  }
}

async function callTriageRpc(functionName: string, args: unknown[]): Promise<Report> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportRpcRow>(client, functionName, args));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportRpcResult(rows[0]);
}

export async function startTriage(reportId: string): Promise<Report> {
  return callTriageRpc("public.start_triage", [reportId]);
}

export async function requestInformation(reportId: string, reason: string): Promise<Report> {
  return callTriageRpc("public.request_information", [reportId, reason]);
}

export async function acceptReport(reportId: string): Promise<Report> {
  return callTriageRpc("public.accept_report", [reportId]);
}

export async function markDuplicate(reportId: string, duplicateOfReportId: string): Promise<Report> {
  return callTriageRpc("public.mark_duplicate", [reportId, duplicateOfReportId]);
}

export async function markInformative(reportId: string): Promise<Report> {
  return callTriageRpc("public.mark_informative", [reportId]);
}

export async function markNotApplicable(reportId: string): Promise<Report> {
  return callTriageRpc("public.mark_not_applicable", [reportId]);
}

export async function rejectReport(reportId: string): Promise<Report> {
  return callTriageRpc("public.reject_report", [reportId]);
}

export async function resolveReport(reportId: string, resolutionSummary: string): Promise<Report> {
  return callTriageRpc("public.resolve_report", [reportId, resolutionSummary]);
}

/** The inbox's link picker for a report with no matched_scope_entry_id (see
 * db/migrations/202608270001_report_foundation.sql's own comment on why that column can
 * be null -- FK `on delete set null`, or a report submitted before scope tracking
 * existed). Not a triage state transition -- reuses callTriageRpc purely because it's the
 * identical shape (one RPC call, manager-only, returns the updated report), never
 * touches report.status. See db/migrations/
 * 202609090005_link_report_to_scope_entry.sql for the real authorization/validation
 * (manager-only; the chosen scope entry must belong to the same program). */
export async function linkReportToScopeEntry(reportId: string, scopeEntryId: string): Promise<Report> {
  return callTriageRpc("public.link_report_to_scope_entry", [reportId, scopeEntryId]);
}

/** cvss is optional -- omitting it behaves identically to before CVSS existed (severity
 * set, no score attached). Passing it computes and stores a real base score server-side;
 * see db/migrations/202609030006_cvss_severity_scoring.sql. */
export async function setReportSeverity(reportId: string, severity: ReportSeverity, cvss?: CvssMetrics): Promise<Report> {
  return callTriageRpc("public.set_report_severity", [
    reportId,
    severity,
    cvss?.attackVector ?? null,
    cvss?.attackComplexity ?? null,
    cvss?.privilegesRequired ?? null,
    cvss?.userInteraction ?? null,
    cvss?.scope ?? null,
    cvss?.confidentialityImpact ?? null,
    cvss?.integrityImpact ?? null,
    cvss?.availabilityImpact ?? null,
  ]);
}

type ReportAuditRow = { id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string; metadata: Record<string, unknown> | null; created_at: string };

function mapReportAuditRow(row: ReportAuditRow): OrganizationAuditEventRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/** Triage decision history -- reuses audit_logs (see docs/decisions/0009), scoped by the
 * same "audit logs read by org admins" RLS policy the organization activity timeline
 * already relies on. A program_members manager who is not an org owner/security_admin
 * gets an empty result here today, the same disclosed gap 0009 documents for triage
 * itself -- this never errors, it just reflects what RLS allows. */
export async function getReportAuditActivity(reportId: string): Promise<OrganizationAuditEventRecord[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportAuditRow>(
          "select id, actor_id, action, entity_type, entity_id, metadata, created_at from public.audit_logs where entity_type = 'report' and entity_id = $1 order by created_at desc",
          [reportId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportAuditRow);
}

// --- Communication and evidence (see docs/decisions/0010-report-evidence-and-communication.md).
// Reads go through RLS-scoped direct table selects, the same pattern every other read in
// this codebase uses -- visibility is enforced by report_messages'/report_evidence's own
// RLS policy, never filtered client-side. Mutations are append-only RPCs; there is no
// update/delete in this slice. ---

type ReportMessageRow = { id: string; report_id: string; author_id: string; author_context: ReportMessage["authorContext"]; visibility: ReportVisibility; body: string; created_at: string; author_display_name: string | null };
type ReportEvidenceRow = {
  id: string;
  report_id: string;
  author_id: string;
  author_context: ReportEvidence["authorContext"];
  visibility: ReportVisibility;
  evidence_type: ReportEvidenceType;
  content: string | null;
  object_key: string | null;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  created_at: string;
  author_display_name: string | null;
};

function mapReportMessageRow(row: ReportMessageRow): ReportMessage {
  return {
    id: row.id,
    reportId: row.report_id,
    authorId: row.author_id,
    authorName: row.author_display_name ?? "Deactivated account",
    authorContext: row.author_context,
    visibility: row.visibility,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapReportEvidenceRow(row: ReportEvidenceRow): ReportEvidence {
  return {
    id: row.id,
    reportId: row.report_id,
    authorId: row.author_id,
    authorName: row.author_display_name ?? "Deactivated account",
    authorContext: row.author_context,
    visibility: row.visibility,
    evidenceType: row.evidence_type,
    content: row.content,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

/** Every message the current viewer is permitted to see for this report -- RLS decides
 * which rows come back (researcher_visible-and-own-report, or org oversight/program
 * membership); an internal row is never returned to the submitting researcher. */
export async function listReportMessages(reportId: string): Promise<ReportMessage[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportMessageRow>(
          `select m.id, m.report_id, m.author_id, m.author_context, m.visibility, m.body, m.created_at, u.display_name as author_display_name
           from public.report_messages m left join public.users u on u.id = m.author_id
           where m.report_id = $1 order by m.created_at asc`,
          [reportId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportMessageRow);
}

export async function listReportEvidence(reportId: string): Promise<ReportEvidence[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<ReportEvidenceRow>(
          `select e.id, e.report_id, e.author_id, e.author_context, e.visibility, e.evidence_type, e.content, e.object_key, e.original_filename, e.content_type, e.size_bytes, e.sha256, e.created_at, u.display_name as author_display_name
           from public.report_evidence e left join public.users u on u.id = e.author_id
           where e.report_id = $1 order by e.created_at asc`,
          [reportId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportEvidenceRow);
}

type ReportMessageRpcRow = Omit<ReportMessageRow, "author_display_name">;
function mapReportMessageRpcResult(row: ReportMessageRpcRow): ReportMessage {
  return mapReportMessageRow({ ...row, author_display_name: null });
}

type ReportEvidenceRpcRow = Omit<ReportEvidenceRow, "author_display_name">;
function mapReportEvidenceRpcResult(row: ReportEvidenceRpcRow): ReportEvidence {
  return mapReportEvidenceRow({ ...row, author_display_name: null });
}

/** Always researcher_visible -- the researcher-authorized RPC hardcodes it, never
 * accepts a visibility parameter. See 0010. */
export async function postResearcherMessage(reportId: string, body: string): Promise<ReportMessage> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportMessageRpcRow>(client, "public.post_researcher_message", [reportId, body]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportMessageRpcResult(rows[0]);
}

export async function postOrganizationMessage(reportId: string, body: string, visibility: ReportVisibility): Promise<ReportMessage> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportMessageRpcRow>(client, "public.post_organization_message", [reportId, body, visibility]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportMessageRpcResult(rows[0]);
}

export async function addResearcherEvidence(reportId: string, evidenceType: ReportEvidenceType, content: string): Promise<ReportEvidence> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportEvidenceRpcRow>(client, "public.add_researcher_evidence", [reportId, evidenceType, content]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportEvidenceRpcResult(rows[0]);
}

export async function addOrganizationEvidence(reportId: string, evidenceType: ReportEvidenceType, content: string, visibility: ReportVisibility): Promise<ReportEvidence> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ReportEvidenceRpcRow>(client, "public.add_organization_evidence", [reportId, evidenceType, content, visibility]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportEvidenceRpcResult(rows[0]);
}

type ReportCollaboratorRow = {
  id: string;
  researcher_id: string;
  display_name: string;
  public_username: string | null;
  bounty_split_percent: number;
  added_at: string;
};

function mapReportCollaboratorRow(row: ReportCollaboratorRow): ReportCollaborator {
  return {
    id: row.id,
    researcherId: row.researcher_id,
    displayName: row.display_name,
    publicUsername: row.public_username,
    bountySplitPercent: Number(row.bounty_split_percent),
    addedAt: row.added_at,
  };
}

export async function listReportCollaborators(reportId: string): Promise<ReportCollaborator[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportCollaboratorRow>(client, "public.list_report_collaborators", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportCollaboratorRow);
}

export async function addReportCollaborator(reportId: string, collaboratorUsername: string, bountySplitPercent: number): Promise<ReportCollaborator> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<ReportCollaboratorRow>(client, "public.add_report_collaborator", [reportId, collaboratorUsername, bountySplitPercent]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportCollaboratorRow(rows[0]);
}

export async function removeReportCollaborator(collaboratorId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.remove_report_collaborator", [collaboratorId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

type ReportRetestRow = {
  id: string;
  report_id: string;
  requested_by: string;
  status: ReportRetestStatus;
  requester_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  escalated_by: string | null;
  escalated_at: string | null;
  requested_at: string;
};

function mapReportRetestRow(row: ReportRetestRow): ReportRetest {
  return {
    id: row.id,
    reportId: row.report_id,
    requestedBy: row.requested_by,
    status: row.status,
    requesterNotes: row.requester_notes,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNotes: row.decision_notes,
    escalatedBy: row.escalated_by,
    escalatedAt: row.escalated_at,
    requestedAt: row.requested_at,
  };
}

async function callRetestRpc(functionName: string, args: unknown[]): Promise<ReportRetest> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportRetestRow>(client, functionName, args));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportRetestRow(rows[0]);
}

export async function listReportRetests(reportId: string): Promise<ReportRetest[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportRetestRow>(client, "public.list_report_retests", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportRetestRow);
}

export async function requestReportRetest(reportId: string, requesterNotes?: string): Promise<ReportRetest> {
  return callRetestRpc("public.request_report_retest", [reportId, requesterNotes ?? null]);
}

export async function decideReportRetest(retestId: string, outcome: Extract<ReportRetestStatus, "confirmed_fixed" | "still_vulnerable">, decisionNotes?: string): Promise<ReportRetest> {
  return callRetestRpc("public.decide_report_retest", [retestId, outcome, decisionNotes ?? null]);
}

/** Only the researcher who requested the retest may escalate their own, and only while
 * it's still 'requested' -- see db/migrations/202609050011_report_retest_escalation.sql. */
export async function escalateReportRetest(retestId: string): Promise<ReportRetest> {
  return callRetestRpc("public.escalate_report_retest", [retestId]);
}

/** A real report a platform admin can act on -- mirrors EscalatedMediationForAdmin; see
 * list_escalated_retests_for_admin's own comment for why report content is exposed here. */
export type EscalatedRetestForAdmin = {
  id: string;
  reportId: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  programName: string;
  reportTitle: string;
  requestedBy: string;
  requestedByName: string;
  requesterNotes: string | null;
  escalatedAt: string | null;
  requestedAt: string;
};

type EscalatedRetestForAdminRow = {
  id: string;
  report_id: string;
  organization_id: string;
  organization_name: string;
  program_id: string;
  program_name: string;
  report_title: string;
  requested_by: string;
  requested_by_name: string;
  requester_notes: string | null;
  escalated_at: string | null;
  requested_at: string;
};

/** Platform-admin-only read -- fails with FORBIDDEN for anyone else (re-checked inside
 * the RPC itself, not merely gated by this wrapper). */
export async function listEscalatedRetestsForAdmin(): Promise<EscalatedRetestForAdmin[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<EscalatedRetestForAdminRow>(client, "public.list_escalated_retests_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    reportId: row.report_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    programId: row.program_id,
    programName: row.program_name,
    reportTitle: row.report_title,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requesterNotes: row.requester_notes,
    escalatedAt: row.escalated_at,
    requestedAt: row.requested_at,
  }));
}

export async function resolveEscalatedRetest(retestId: string, outcome: Extract<ReportRetestStatus, "confirmed_fixed" | "still_vulnerable">, decisionNotes: string): Promise<ReportRetest> {
  return callRetestRpc("public.resolve_escalated_report_retest", [retestId, outcome, decisionNotes]);
}

type ReportMediationRow = {
  id: string;
  report_id: string;
  opened_by: string;
  reason: ReportMediationReason;
  status: ReportMediationStatus;
  description: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  escalated_by: string | null;
  escalated_at: string | null;
  opened_at: string;
};

function mapReportMediationRow(row: ReportMediationRow): ReportMediation {
  return {
    id: row.id,
    reportId: row.report_id,
    openedBy: row.opened_by,
    reason: row.reason,
    status: row.status,
    description: row.description,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    resolutionNotes: row.resolution_notes,
    escalatedBy: row.escalated_by,
    escalatedAt: row.escalated_at,
    openedAt: row.opened_at,
  };
}

async function callMediationRpc(functionName: string, args: unknown[]): Promise<ReportMediation> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportMediationRow>(client, functionName, args));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapReportMediationRow(rows[0]);
}

export async function listReportMediations(reportId: string): Promise<ReportMediation[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<ReportMediationRow>(client, "public.list_report_mediations", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapReportMediationRow);
}

export async function openReportMediation(reportId: string, reason: ReportMediationReason, description: string): Promise<ReportMediation> {
  return callMediationRpc("public.open_report_mediation", [reportId, reason, description]);
}

export async function resolveReportMediation(mediationId: string, outcome: Extract<ReportMediationStatus, "resolved" | "declined">, resolutionNotes: string): Promise<ReportMediation> {
  return callMediationRpc("public.resolve_report_mediation", [mediationId, outcome, resolutionNotes]);
}

/** Only the researcher who opened the mediation may escalate their own, and only while
 * it's still 'open' -- see db/migrations/202609050009_report_mediation_escalation.sql. */
export async function escalateReportMediation(mediationId: string): Promise<ReportMediation> {
  return callMediationRpc("public.escalate_report_mediation", [mediationId]);
}

/** A real report a platform admin can act on -- see
 * list_escalated_mediations_for_admin's own comment for why this is the one place a
 * platform-admin RPC intentionally exposes report content (title/description-adjacent
 * context), unlike every Needs Recovery row. */
export type EscalatedMediationForAdmin = {
  id: string;
  reportId: string;
  organizationId: string;
  organizationName: string;
  programId: string;
  programName: string;
  reportTitle: string;
  openedBy: string;
  openedByName: string;
  reason: ReportMediationReason;
  description: string;
  escalatedAt: string | null;
  openedAt: string;
};

type EscalatedMediationForAdminRow = {
  id: string;
  report_id: string;
  organization_id: string;
  organization_name: string;
  program_id: string;
  program_name: string;
  report_title: string;
  opened_by: string;
  opened_by_name: string;
  reason: ReportMediationReason;
  description: string;
  escalated_at: string | null;
  opened_at: string;
};

/** Platform-admin-only read -- fails with FORBIDDEN for anyone else (re-checked inside
 * the RPC itself, not merely gated by this wrapper). */
export async function listEscalatedMediationsForAdmin(): Promise<EscalatedMediationForAdmin[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<EscalatedMediationForAdminRow>(client, "public.list_escalated_mediations_for_admin"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    reportId: row.report_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    programId: row.program_id,
    programName: row.program_name,
    reportTitle: row.report_title,
    openedBy: row.opened_by,
    openedByName: row.opened_by_name,
    reason: row.reason,
    description: row.description,
    escalatedAt: row.escalated_at,
    openedAt: row.opened_at,
  }));
}

export async function resolveEscalatedMediation(mediationId: string, outcome: Extract<ReportMediationStatus, "resolved" | "declined">, resolutionNotes: string): Promise<ReportMediation> {
  return callMediationRpc("public.resolve_escalated_report_mediation", [mediationId, outcome, resolutionNotes]);
}

// --- Bearer-token API "for actor" reads (see docs/decisions/0018, 0075) ---
// Every function below is SECURITY INVOKER + service_role-only granted (no authenticated
// grant exists at all) -- withServiceRoleTransaction is required, never optional. Never
// call any of these with a client-supplied actorId.

export async function getReportStatusCountsForActor(actorId: string): Promise<{ status: ReportStatus; count: number }[]> {
  try {
    return await withServiceRoleTransaction((client) => callRpc<{ status: ReportStatus; count: number }>(client, "public.get_report_status_counts_for_actor", [actorId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export type ApiReportEvidence = {
  id: string;
  evidenceType: ReportEvidenceType;
  content: string | null;
  objectKey: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  authorContext: "researcher" | "organization";
  createdAt: string;
};

type ApiReportEvidenceRow = {
  id: string;
  evidence_type: ReportEvidenceType;
  content: string | null;
  object_key: string | null;
  original_filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  author_context: "researcher" | "organization";
  created_at: string;
};

/** Never call with a client-supplied actorId -- see get_report_status_counts_for_actor's
 * own comment for why this and its two siblings below are SECURITY INVOKER,
 * service_role-only RPCs rather than the ordinary SECURITY DEFINER pattern. */
export async function listReportEvidenceForActor(actorId: string, reportId: string): Promise<ApiReportEvidence[]> {
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) => callRpc<ApiReportEvidenceRow>(client, "public.list_report_evidence_for_actor", [actorId, reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    evidenceType: row.evidence_type,
    content: row.content,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    authorContext: row.author_context,
    createdAt: row.created_at,
  }));
}

export type ApiReportMessage = {
  id: string;
  body: string;
  authorContext: "researcher" | "organization";
  createdAt: string;
};

type ApiReportMessageRow = { id: string; body: string; author_context: "researcher" | "organization"; created_at: string };

export async function listReportMessagesForActor(actorId: string, reportId: string): Promise<ApiReportMessage[]> {
  let rows;
  try {
    rows = await withServiceRoleTransaction((client) => callRpc<ApiReportMessageRow>(client, "public.list_report_messages_for_actor", [actorId, reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ id: row.id, body: row.body, authorContext: row.author_context, createdAt: row.created_at }));
}

/** Sets or clears who is working a report (assign_report re-checks the caller may triage it
 * and that the assignee could triage it themselves). */
export async function assignReport(reportId: string, assigneeId: string | null): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.assign_report", [reportId, assigneeId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export type AssignableStaff = { userId: string; displayName: string };

/** Who may be assigned reports in a program (or anywhere in the organization). */
export async function listAssignableStaff(organizationId: string, programId?: string): Promise<AssignableStaff[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ user_id: string; display_name: string }>(client, "public.list_assignable_staff", [organizationId, programId ?? null]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ userId: row.user_id, displayName: row.display_name }));
}

/** Every program the researcher has reported to -- the /reports program filter's options. */
export async function listMyReportedPrograms(userId: string): Promise<{ id: string; name: string }[]> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<{ id: string; name: string }>(
          "select distinct p.id, p.name from public.reports r join public.programs p on p.id = r.program_id where r.researcher_id = $1 order by p.name",
          [userId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows;
}

/** A researcher-safe history of their report: outcomes and decisions, never who on the
 * organization's side made them or any internal note (get_report_status_history). */
export type ReportStatusEvent = { action: string; occurredAt: string; detail: string | null };

export async function getReportStatusHistory(reportId: string): Promise<ReportStatusEvent[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ action: string; occurred_at: string; detail: string | null }>(client, "public.get_report_status_history", [reportId]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ action: row.action, occurredAt: row.occurred_at, detail: row.detail }));
}

/** The researcher's saved draft for a program (report_drafts, 202610060014), or null. */
export async function getMyReportDraft(programId: string): Promise<{ draft: Record<string, unknown>; updatedAt: string } | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client
        .query<{ draft: Record<string, unknown>; updated_at: string }>("select draft, updated_at from public.report_drafts where program_id = $1 and researcher_id = $2", [programId, actor?.id ?? null])
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? { draft: rows[0].draft, updatedAt: rows[0].updated_at } : null;
}

export async function saveMyReportDraft(programId: string, draft: Record<string, unknown>): Promise<string> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ save_my_report_draft: string }>(client, "public.save_my_report_draft", [programId, JSON.stringify(draft)]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.save_my_report_draft ?? new Date().toISOString();
}

export async function deleteMyReportDraft(programId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.delete_my_report_draft", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}
