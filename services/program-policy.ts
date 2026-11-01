import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ProgramPolicy, ProgramPolicyInput, ReportSla, OrganizationSlaSummary } from "@/types/program-policy";

type PolicyRow = {
  id: string;
  program_id: string;
  version_number: number;
  rules_of_engagement: string;
  safe_harbor: boolean;
  disclosure_mode: ProgramPolicy["disclosureMode"];
  disclosure_days: number | null;
  first_response_target_hours: number | null;
  triage_target_hours: number | null;
  resolution_target_days: number | null;
  change_note: string | null;
  created_at: string;
};

function mapPolicy(row: PolicyRow): ProgramPolicy {
  return {
    id: row.id,
    programId: row.program_id,
    versionNumber: row.version_number,
    rulesOfEngagement: row.rules_of_engagement,
    safeHarbor: row.safe_harbor,
    disclosureMode: row.disclosure_mode,
    disclosureDays: row.disclosure_days,
    firstResponseTargetHours: row.first_response_target_hours,
    triageTargetHours: row.triage_target_hours,
    resolutionTargetDays: row.resolution_target_days,
    changeNote: row.change_note,
    publishedAt: row.created_at,
  };
}

/** The program's effective policy (202610060009) -- null when none is published, or when
 * the caller can't see the program. Works signed out for public programs. */
export async function getProgramPolicy(programId: string): Promise<ProgramPolicy | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PolicyRow>(client, "public.get_program_policy", [programId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? mapPolicy(rows[0]) : null;
}

export async function publishProgramPolicy(programId: string, input: ProgramPolicyInput): Promise<ProgramPolicy> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<PolicyRow>(client, "public.publish_program_policy", [
        programId,
        input.rulesOfEngagement,
        input.safeHarbor,
        input.disclosureMode,
        input.disclosureMode === "coordinated" ? input.disclosureDays : null,
        input.firstResponseTargetHours,
        input.triageTargetHours,
        input.resolutionTargetDays,
        input.changeNote ?? null,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return mapPolicy(rows[0]);
}

type SlaRow = {
  policy_version_number: number | null;
  first_response_due_at: string | null;
  first_responded_at: string | null;
  triage_due_at: string | null;
  triaged_at: string | null;
  resolution_due_at: string | null;
  closed_at: string | null;
  first_response_breached: boolean | null;
  triage_breached: boolean | null;
  resolution_breached: boolean | null;
};

/** Response targets for one report, measured against the policy it was submitted under. */
export async function getReportSla(reportId: string): Promise<ReportSla | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<SlaRow>(client, "public.get_report_sla", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row || row.policy_version_number === null) return null;
  const target = (dueAt: string | null, metAt: string | null, breached: boolean | null) => (dueAt ? { dueAt, metAt, breached: Boolean(breached) } : null);
  return {
    policyVersionNumber: row.policy_version_number,
    firstResponse: target(row.first_response_due_at, row.first_responded_at, row.first_response_breached),
    triage: target(row.triage_due_at, row.triaged_at, row.triage_breached),
    resolution: target(row.resolution_due_at, row.closed_at, row.resolution_breached),
  };
}

type SlaSummaryRow = {
  program_id: string;
  report_count: string;
  first_response_tracked: string;
  first_response_breached: string;
  triage_tracked: string;
  triage_breached: string;
  resolution_tracked: string;
  resolution_breached: string;
  median_first_response_hours: string | null;
};

export async function getOrganizationSlaSummary(organizationId: string): Promise<OrganizationSlaSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<SlaSummaryRow>(client, "public.get_organization_sla_summary", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    programId: row.program_id,
    reportCount: Number(row.report_count),
    firstResponse: { tracked: Number(row.first_response_tracked), breached: Number(row.first_response_breached) },
    triage: { tracked: Number(row.triage_tracked), breached: Number(row.triage_breached) },
    resolution: { tracked: Number(row.resolution_tracked), breached: Number(row.resolution_breached) },
    medianFirstResponseHours: row.median_first_response_hours === null ? null : Number(row.median_first_response_hours),
  }));
}
