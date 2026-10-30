import type { PoolClient } from "pg";
import type { ReportSeverity, ReportStatus } from "../../types/report";
import type { AnalyticsFilters } from "./filters";
import type { ReportFact, ScopeAsset } from "./report-metrics";

// The Explore dataset. Takes a client already in the caller's identity: the page's signed-in
// user, or (scheduled exports) the person who created the schedule -- the database re-checks
// that identity's access either way.

type FactRow = {
  report_id: string; title: string; program_id: string; program_name: string; asset_id: string | null; asset_label: string | null; asset_type: string;
  severity: string | null; cvss_score: string | null; status: string; researcher_id: string; researcher_name: string | null;
  submitted_at: Date; first_response_at: Date | null; triaged_at: Date | null; closed_at: Date | null;
  first_response_target_hours: number | null; triage_target_hours: number | null; resolution_target_days: number | null;
  bounty_currency: string | null; bounty_awarded_minor_units: string | null; bounty_paid_minor_units: string;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export async function fetchReportFacts(client: PoolClient, organizationId: string, f: AnalyticsFilters): Promise<ReportFact[]> {
  const { rows } = await client.query<FactRow>("select * from public.list_organization_report_facts($1, $2, $3, $4, $5, $6, $7)", [organizationId, f.from, f.to, f.programIds, f.severities, f.statuses, f.assetIds]);
  return rows.map((r) => ({
    reportId: r.report_id,
    title: r.title,
    programId: r.program_id,
    programName: r.program_name,
    assetId: r.asset_id,
    assetLabel: r.asset_label,
    assetType: r.asset_type,
    severity: r.severity as ReportSeverity | null,
    cvssScore: r.cvss_score === null ? null : Number(r.cvss_score),
    status: r.status as ReportStatus,
    researcherId: r.researcher_id,
    researcherName: r.researcher_name,
    submittedAt: iso(r.submitted_at)!,
    firstResponseAt: iso(r.first_response_at),
    triagedAt: iso(r.triaged_at),
    closedAt: iso(r.closed_at),
    firstResponseTargetHours: r.first_response_target_hours,
    triageTargetHours: r.triage_target_hours,
    resolutionTargetDays: r.resolution_target_days,
    bountyCurrency: r.bounty_currency,
    bountyAwardedMinorUnits: r.bounty_awarded_minor_units === null ? null : Number(r.bounty_awarded_minor_units),
    bountyPaidMinorUnits: Number(r.bounty_paid_minor_units),
  }));
}

export async function fetchScopeAssets(client: PoolClient, organizationId: string, programIds: string[]): Promise<ScopeAsset[]> {
  const { rows } = await client.query<{ asset_id: string; asset_label: string; asset_type: string; program_names: string[] }>("select * from public.list_organization_scope_assets($1, $2)", [organizationId, programIds]);
  return rows.map((r) => ({ assetId: r.asset_id, assetLabel: r.asset_label, assetType: r.asset_type, programNames: r.program_names }));
}

/** With an asset filter, coverage is measured over the chosen assets only. */
export function narrowScope(assets: ScopeAsset[], f: AnalyticsFilters): ScopeAsset[] {
  return f.assetIds.length ? assets.filter((a) => f.assetIds.includes(a.assetId)) : assets;
}

/** Human-readable filter lines for export headers ("Programs: Web, API"). */
export function describeFilters(f: AnalyticsFilters, names: { programs: Map<string, string>; assets: Map<string, string> }): string[] {
  const out: string[] = [];
  if (f.programIds.length) out.push(`Programs: ${f.programIds.map((id) => names.programs.get(id) ?? "Unknown").join(", ")}`);
  if (f.severities.length) out.push(`Severity: ${f.severities.join(", ")}`);
  if (f.statuses.length) out.push(`Status: ${f.statuses.map((s) => s.replace(/_/g, " ")).join(", ")}`);
  if (f.assetIds.length) out.push(`Assets: ${f.assetIds.map((id) => names.assets.get(id) ?? "Unknown").join(", ")}`);
  return out;
}
