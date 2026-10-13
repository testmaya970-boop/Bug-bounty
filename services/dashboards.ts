import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";
import type { ReportStatus } from "@/types/report";

// The three analytics dashboards (db/migrations/202610130003). Each is one RPC returning one
// jsonb document, typed here exactly as the SQL builds it (snake_case kept: it is a wire shape).

type Window<T> = { current: T; previous: T };
type Money = { currency: string };

export type ResearcherDashboard = {
  since: string;
  kpis: Window<{ submitted: number; valid: number; decided: number; median_hours_to_first_response: number | null }>;
  reputation: number;
  reputation_previous: number;
  awards: (Money & { awarded: number; awarded_previous: number; paid: number })[];
  status: { status: ReportStatus; count: number }[];
  severity: { severity: string; count: number }[];
  weekly: { week: string; submitted: number; valid: number; invalid: number }[];
  reputation_weekly: { week: string; score: number }[];
  earnings_weekly: (Money & { week: string; amount: number })[];
  programs: { program_id: string; name: string; submitted: number; valid: number }[];
};

export type OrganizationDashboard = {
  since: string;
  kpis: Window<{ received: number; valid: number; decided: number; researchers: number; median_hours_to_triage: number | null; median_days_to_resolution: number | null }>;
  open_backlog: number;
  awards: (Money & { awarded: number; awarded_previous: number })[];
  weekly: { week: string; critical: number; high: number; medium: number; low: number; none: number; unrated: number; median_hours_to_triage: number | null }[];
  weaknesses: { weakness: string; count: number }[];
  assets: { target: string; count: number; valid: number }[];
  programs: { program_id: string; name: string; status: string; received: number; valid: number; open: number }[];
  researchers: { name: string; valid: number; submitted: number }[];
};

export type PlatformDashboard = {
  since: string;
  reports: Window<{ reports: number; valid: number; decided: number }>;
  signups: Window<{ researchers: number; organization_accounts: number }>;
  totals: { active_organizations: number; researchers: number; active_programs: number; pending_launches: number; kyc_pending: number; open_mediations: number; errors_24h: number };
  payouts: (Money & { paid: number; paid_previous: number })[];
  weekly: { week: string; reports: number; valid: number; researchers: number; organization_accounts: number }[];
  programs_by_status: { status: string; count: number }[];
  top_organizations: { organization_id: string; name: string; reports: number; valid: number }[];
};

async function readDashboard<T>(fn: string, args: unknown[]): Promise<T> {
  const actor = await getCurrentUser();
  try {
    const rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<Record<string, T>>(client, fn, args));
    return Object.values(rows[0])[0];
  } catch (error) {
    mapError(error as { message: string });
  }
}

export const getMyResearcherDashboard = (days: number) => readDashboard<ResearcherDashboard>("public.get_my_researcher_dashboard", [days]);
export const getOrganizationDashboard = (organizationId: string, days: number) => readDashboard<OrganizationDashboard>("public.get_organization_dashboard", [organizationId, days]);
export const getPlatformDashboard = (days: number) => readDashboard<PlatformDashboard>("public.get_platform_dashboard", [days]);

export type ActivityDashboard = {
  since: string;
  kpis: Window<{ actions: number; people: number; sensitive: number }>;
  weekly: { week: string; reports: number; programs: number; team: number; money: number; other: number }[];
  top_actions: { action: string; count: number; sensitive: boolean }[];
  top_people: { name: string; is_member: boolean; count: number }[];
};

export const getOrganizationActivityDashboard = (organizationId: string, days: number) =>
  readDashboard<ActivityDashboard>("public.get_organization_activity_dashboard", [organizationId, days]);
