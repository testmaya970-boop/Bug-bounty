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
  published_title: string | null;
  published_summary: string | null;
  published_at: string | null;
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
    publishedTitle: row.published_title,
    publishedSummary: row.published_summary,
    publishedAt: row.published_at,
  };
}

export async function requestReportDisclosure(reportId: string): Promise<ReportDisclosure> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<DisclosureRow>(client, "public.request_report_disclosure", [reportId]));
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

/** A plain, RLS-scoped read for the report detail page's organization-side rail -- the
 * table's own SELECT policy (report_disclosures read by participants or public if
 * approved, 202609030001) already covers "an org owner/security_admin or program member
 * can read any status for a report in their org," so no RPC wrapper is needed here, only
 * a policy-scoped query, the same pattern services/payments.ts uses for its own
 * RLS-covered reads. Returns null when no disclosure has ever been requested. Granted to
 * anon in addition to authenticated (an approved disclosure is public), so this uses
 * withPublicTransaction to preserve signed-out access to an approved disclosure's status. */
export async function getReportDisclosure(reportId: string): Promise<ReportDisclosure | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) =>
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
  published_summary: string;
  confirmed_severity: PublicDisclosure["confirmedSeverity"];
  program_name: string;
  organization_name: string;
  published_at: string;
};

/** Anonymous-readable -- the public disclosure feed. Uses withPublicTransaction: `anon`
 * for a signed-out visitor, `authenticated` for a signed-in one -- the RPC itself is
 * grant-scoped to anon+authenticated either way. */
export async function listPublicDisclosures(): Promise<PublicDisclosure[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicDisclosureRow>(client, "public.list_public_disclosures"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    reportId: row.report_id,
    publishedTitle: row.published_title,
    publishedSummary: row.published_summary,
    confirmedSeverity: row.confirmed_severity,
    programName: row.program_name,
    organizationName: row.organization_name,
    publishedAt: row.published_at,
  }));
}
