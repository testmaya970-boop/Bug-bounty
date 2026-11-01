import "server-only";
import { withActorTransaction, withPublicTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type { PendingReportDisclosure, PublicDisclosure, ReportDisclosure } from "@/types/report";

export { OrganizationServiceError };

type DisclosureRow = {
  id: string;
  report_id: string;
  organization_id: string;
  status: ReportDisclosure["status"];
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
  draft_title: string | null;
  draft_summary: string | null;
  published_title: string | null;
  published_summary: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  unpublish_reason: string | null;
};

function mapDisclosureRow(row: DisclosureRow): ReportDisclosure {
  return {
    id: row.id,
    reportId: row.report_id,
    organizationId: row.organization_id,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    declineReason: row.decline_reason,
    draftTitle: row.draft_title,
    draftSummary: row.draft_summary,
    publishedTitle: row.published_title,
    publishedSummary: row.published_summary,
    publishedAt: row.published_at,
    unpublishedAt: row.unpublished_at,
    unpublishReason: row.unpublish_reason,
  };
}

/** The researcher asks to publish, proposing the public write-up (redactable by the org). */
export async function requestReportDisclosure(reportId: string, title?: string, summary?: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.request_report_disclosure", [reportId, title ?? null, summary ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDisclosureRow(rows[0]);
}

export async function approveReportDisclosure(reportId: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.approve_report_disclosure", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDisclosureRow(rows[0]);
}

export async function declineReportDisclosure(reportId: string, reason?: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.decline_report_disclosure", [reportId, reason ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDisclosureRow(rows[0]);
}

/** Edit (redact) the pending public write-up: the triage team, or the researcher while requested. */
export async function updateReportDisclosureDraft(reportId: string, title: string, summary: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.update_report_disclosure_draft", [reportId, title, summary]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDisclosureRow(rows[0]);
}

export async function unpublishReportDisclosure(reportId: string, reason: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.unpublish_report_disclosure", [reportId, reason]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapDisclosureRow(rows[0]);
}

/** Null when the report has never had a disclosure requested -- a real, meaningful
 * absence, not an error. */
export async function getMyReportDisclosure(reportId: string): Promise<ReportDisclosure | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.get_my_report_disclosure", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return row?.id ? mapDisclosureRow(row) : null;
}

/** The report detail page's read, scoped by the reports table's RLS (the researcher and
 * the report's staff). Signed-out visitors never read this table directly any more
 * (202610060012) -- the public uses list/getPublicDisclosure, which carry no user ids. */
export async function getReportDisclosure(reportId: string): Promise<ReportDisclosure | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<DisclosureRow>("select * from public.report_disclosures where report_id = $1", [reportId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapDisclosureRow(rows[0]) : null;
}

type PendingDisclosureRow = { id: string; report_id: string; program_id: string; report_title: string; program_name: string; researcher_display_name: string; requested_at: string };

export async function listPendingReportDisclosures(organizationId: string): Promise<PendingReportDisclosure[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PendingDisclosureRow>(client, "public.list_pending_report_disclosures", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    reportId: row.report_id,
    programId: row.program_id,
    reportTitle: row.report_title,
    programName: row.program_name,
    researcherDisplayName: row.researcher_display_name,
    requestedAt: row.requested_at,
  }));
}

type PublicDisclosureRow = {
  report_id: string;
  published_title: string;
  published_summary: string | null;
  severity: PublicDisclosure["confirmedSeverity"];
  program_id: string;
  program_name: string;
  organization_id: string;
  organization_name: string;
  researcher_username: string | null;
  published_at: string;
};

function mapPublicRow(row: PublicDisclosureRow): PublicDisclosure {
  return {
    reportId: row.report_id,
    publishedTitle: row.published_title,
    publishedSummary: row.published_summary,
    confirmedSeverity: row.severity,
    programId: row.program_id,
    programName: row.program_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    researcherUsername: row.researcher_username,
    publishedAt: row.published_at,
  };
}

/** The public feed (anon or signed in): newest first, keyset-paged by publishedAt. */
export async function listPublicDisclosures(before?: string, limit = 50): Promise<PublicDisclosure[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicDisclosureRow>(client, "public.list_public_disclosures", [limit, before ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map(mapPublicRow);
}

/** One published disclosure, or null if it isn't (or isn't yet) public. */
export async function getPublicDisclosure(reportId: string): Promise<PublicDisclosure | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicDisclosureRow>(client, "public.get_public_disclosure", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapPublicRow(rows[0]) : null;
}
