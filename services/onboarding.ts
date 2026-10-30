import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { QueryResultRow } from "pg";

// Organization onboarding read from what the organization has actually done
// (db/migrations/202610230005) -- no stored "completed" flags.

export type OrganizationOnboarding = {
  organizationName: string;
  billingProfile: boolean;
  teamInvited: boolean;
  adminsMfa: boolean;
  jiraConnected: boolean;
  programCreated: boolean;
  scopeAdded: boolean;
  policyPublished: boolean;
  bountyTable: boolean;
  rewardGroups: boolean;
  funded: boolean;
  submitted: boolean;
  inReview: boolean;
  launched: boolean;
  researchersJoined: boolean;
  public: boolean;
  pilotProgramId: string | null;
  pilotProgramName: string | null;
  pilotResearchers: number;
  pilotValidReports: number;
  pilotDays: number;
  firstProgramId: string | null;
};

async function rpc<T extends QueryResultRow>(fn: string, args: unknown[]): Promise<T[]> {
  const actor = await getCurrentUser();
  try {
    return await withActorTransaction(actor?.id ?? null, (client) => callRpc<T>(client, fn, args));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function getOrganizationOnboarding(organizationId: string): Promise<OrganizationOnboarding> {
  const [row] = await rpc<{ get_organization_onboarding: Record<string, unknown> }>("public.get_organization_onboarding", [organizationId]);
  const j = row.get_organization_onboarding;
  const b = (k: string) => j[k] === true;
  return {
    organizationName: String(j.organization_name ?? ""),
    billingProfile: b("billing_profile"),
    teamInvited: b("team_invited"),
    adminsMfa: b("admins_mfa"),
    jiraConnected: b("jira_connected"),
    programCreated: b("program_created"),
    scopeAdded: b("scope_added"),
    policyPublished: b("policy_published"),
    bountyTable: b("bounty_table"),
    rewardGroups: b("reward_groups"),
    funded: b("funded"),
    submitted: b("submitted"),
    inReview: b("in_review"),
    launched: b("launched"),
    researchersJoined: b("researchers_joined"),
    public: b("public"),
    pilotProgramId: (j.pilot_program_id as string | null) ?? null,
    pilotProgramName: (j.pilot_program_name as string | null) ?? null,
    pilotResearchers: Number(j.pilot_researchers ?? 0),
    pilotValidReports: Number(j.pilot_valid_reports ?? 0),
    pilotDays: Number(j.pilot_days ?? 0),
    firstProgramId: (j.first_program_id as string | null) ?? null,
  };
}

export type LaunchReadiness = {
  programId: string; programName: string; organizationId: string; organizationName: string; programType: string; submittedAt: string | null; businessDaysWaiting: number;
  scopeEntries: number; policyPublished: boolean; responseTargets: boolean; bountyTable: boolean; funded: boolean; billingProfile: boolean; adminsMfa: boolean;
};

/** Platform admins: programs waiting for launch review, with the review checks. */
export async function listProgramLaunchReadiness(): Promise<LaunchReadiness[]> {
  type Row = {
    program_id: string; program_name: string; organization_id: string; organization_name: string; program_type: string; submitted_at: string | null; business_days_waiting: number | null;
    scope_entries: number; policy_published: boolean; response_targets: boolean; bounty_table: boolean; funded: boolean; billing_profile: boolean; admins_mfa: boolean;
  };
  const rows = await rpc<Row>("public.list_program_launch_readiness", []);
  return rows.map((r) => ({
    programId: r.program_id, programName: r.program_name, organizationId: r.organization_id, organizationName: r.organization_name, programType: r.program_type,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null, businessDaysWaiting: r.business_days_waiting ?? 0, scopeEntries: r.scope_entries,
    policyPublished: r.policy_published, responseTargets: r.response_targets, bountyTable: r.bounty_table, funded: r.funded, billingProfile: r.billing_profile, adminsMfa: r.admins_mfa,
  }));
}
