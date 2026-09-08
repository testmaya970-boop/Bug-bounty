import "server-only";
import { withActorTransaction, withPublicTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { clampPageSize, decodeCursor, encodeCursor } from "@/lib/pagination";
import type { MyLeaderboardPosition, PublicLeaderboardRow, PublicResearcherProfile, ReputationFactCount, ReputationFactType, ReputationLedgerEntry, ReputationScore, ResearcherBadge } from "@/types/reputation";
import type { ReportSeverity } from "@/types/report";
import type { Page } from "@/types/pagination";

export { OrganizationServiceError };

/**
 * The one safe, derived read exposed to a researcher about their own reputation history
 * -- a plain count per objective category, self-only (the RPC derives the actor from
 * `auth.uid()`, no parameter). Never the raw ledger; never a score. See
 * `get_my_reputation_summary` and docs/decisions/0016-reputation-ledger-foundation.md.
 */
export async function getMyReputationSummary(): Promise<ReputationFactCount[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ fact_type: string; fact_count: number }>(client, "public.get_my_reputation_summary"));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ factType: row.fact_type as ReputationFactType, count: Number(row.fact_count) }));
}

type ReputationLedgerRow = {
  id: string;
  fact_type: string;
  report_id: string;
  program_id: string;
  organization_id: string;
  confirmed_severity: string | null;
  duplicate_of_report_id: string | null;
  occurred_at: string;
};

function mapLedgerRow(row: ReputationLedgerRow): ReputationLedgerEntry {
  return {
    id: row.id,
    factType: row.fact_type as ReputationFactType,
    reportId: row.report_id,
    programId: row.program_id,
    organizationId: row.organization_id,
    confirmedSeverity: row.confirmed_severity as ReportSeverity | null,
    duplicateOfReportId: row.duplicate_of_report_id,
    occurredAt: row.occurred_at,
  };
}

/**
 * The researcher's own real reputation history, newest first -- a direct, RLS-scoped
 * read of `reputation_ledger` (no RPC exists for the raw ledger; `get_my_reputation_summary`
 * is aggregate-only). `reputation_ledger`'s RLS policy also grants the owning
 * organization/program managers read access to rows about their own reports (see
 * docs/decisions/0016) -- irrelevant to `get_my_reputation_summary`'s self-only
 * aggregation, but a real leak risk here: without an explicit `researcher_id` filter, an
 * organization/program-manager caller of this same function would additionally see
 * OTHER researchers' facts on their own reports, not just their own. The explicit
 * `researcher_id = $1` filter below is required for this page to remain "my own
 * reputation only" for every caller, not merely RLS-adjacent -- the same defense-in-depth
 * pattern services/reports.ts's countMyReportsNeedingResponse already establishes.
 * Keyset-paginated on `occurred_at` (the existing `reputation_ledger_researcher_id_idx`
 * supports the `researcher_id` predicate; `occurred_at` itself is unindexed, but ledger
 * volume per researcher is inherently small -- one row per terminal report outcome or
 * finalized bounty, never per submission). No report title/program name here --
 * `reputation_ledger` carries no denormalized copy of either; the caller joins those on
 * afterward via the researcher's own `listMyReports()`, exactly like
 * `getMyNotifications`'s program-name join in services/notifications.ts. */
export async function getMyReputationLedger(userId: string, cursor?: string, limit?: number): Promise<Page<ReputationLedgerEntry>> {
  const pageSize = clampPageSize(limit);
  const decoded = cursor ? decodeCursor(cursor) : null;

  let rows: ReputationLedgerRow[];
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<ReputationLedgerRow>(
          decoded
            ? "select id, fact_type, report_id, program_id, organization_id, confirmed_severity, duplicate_of_report_id, occurred_at from public.reputation_ledger where researcher_id = $1 and occurred_at < $2 order by occurred_at desc limit $3"
            : "select id, fact_type, report_id, program_id, organization_id, confirmed_severity, duplicate_of_report_id, occurred_at from public.reputation_ledger where researcher_id = $1 order by occurred_at desc limit $2",
          decoded ? [userId, decoded.sortValue, pageSize] : [userId, pageSize],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const items = rows.map(mapLedgerRow);
  const nextCursor = rows.length === pageSize ? encodeCursor(rows[rows.length - 1].occurred_at, rows[rows.length - 1].id) : null;
  return { items, nextCursor };
}

/** A true total count of verified outcomes per program, never a partial-page count --
 * deliberately a separate, unpaginated query from getMyReputationLedger, because a
 * per-program tally derived only from one loaded ledger page would undercount as soon as
 * a researcher has more history than fits on it. Safe to leave unpaginated: ledger
 * volume per researcher is inherently small (one row per terminal report outcome or
 * finalized bounty -- see docs/decisions/0016). Same explicit `researcher_id` filter and
 * same reasoning as getMyReputationLedger -- RLS on this table also admits the owning
 * organization/program managers, so the filter is required here too, not merely RLS-
 * adjacent. */
export async function getMyReputationProgramCounts(userId: string): Promise<{ programId: string; count: number }[]> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ program_id: string }>("select program_id from public.reputation_ledger where researcher_id = $1", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.program_id, (counts.get(row.program_id) ?? 0) + 1);
  return [...counts.entries()].map(([programId, count]) => ({ programId, count }));
}

/** A true total per confirmed severity across the researcher's own verified outcomes,
 * never a partial-page count -- same reasoning and same explicit `researcher_id` filter
 * as getMyReputationProgramCounts (this table's RLS also admits the owning organization's
 * managers). `confirmed_severity` is null on every non-`report_resolved` fact type (no
 * severity is set before a report is accepted) and is filtered out here rather than
 * surfaced as a fourth, meaningless "none" bucket. */
export async function getMyReputationSeverityCounts(userId: string): Promise<{ severity: ReportSeverity; count: number }[]> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<{ confirmed_severity: ReportSeverity }>("select confirmed_severity from public.reputation_ledger where researcher_id = $1 and confirmed_severity is not null", [userId])
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }

  const counts = new Map<ReportSeverity, number>();
  for (const row of rows) counts.set(row.confirmed_severity, (counts.get(row.confirmed_severity) ?? 0) + 1);
  return [...counts.entries()].map(([severity, count]) => ({ severity, count }));
}

// ---------------------------------------------------------------------------
// Real, public reputation score + leaderboard + profile (docs/decisions/0065). Every
// function below is a read-side aggregation over the unchanged reputation_ledger table --
// none of them insert, update, or delete anything on it.
// ---------------------------------------------------------------------------

/** Any researcher's own real, computed score -- public-callable (matches
 * get_researcher_reputation_score's `anon, authenticated` grant), since a public profile
 * page must be readable by a signed-out visitor. */
export async function getResearcherReputationScore(researcherId: string): Promise<ReputationScore> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<{ get_researcher_reputation_score: number }>(client, "public.get_researcher_reputation_score", [researcherId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return Number(rows[0]?.get_researcher_reputation_score ?? 0);
}

type PublicLeaderboardRow_DB = { researcher_id: string; display_name: string; public_username: string | null; score: number; resolved_count: number; bounty_finalized_count: number };

/** The real, public leaderboard -- readable signed out, matching HackerOne's/Bugcrowd's
 * own public leaderboard pages. Only researchers with at least one real reputation_ledger
 * fact appear. */
export async function getPublicLeaderboard(limit = 50): Promise<PublicLeaderboardRow[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicLeaderboardRow_DB>(client, "public.get_public_leaderboard", [limit]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    researcherId: row.researcher_id,
    displayName: row.display_name,
    publicUsername: row.public_username,
    score: row.score,
    resolvedCount: row.resolved_count,
    bountyFinalizedCount: row.bounty_finalized_count,
  }));
}

/** The signed-in researcher's own rank on the exact same leaderboard the public page
 * shows -- self-only, computed from the identical aggregation so it can never disagree
 * with where they'd actually appear publicly. */
export async function getMyLeaderboardPosition(): Promise<MyLeaderboardPosition | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<{ rank: number; score: number; total_researchers: number }>(client, "public.get_my_leaderboard_position"));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  return { rank: row.rank, score: row.score, totalResearchers: row.total_researchers };
}

/** The caller's own current public_username, or null if never set -- a plain,
 * RLS-scoped-to-self read (public.users' own "read own profile" policy already covers
 * this column, no new RPC needed). */
export async function getMyPublicUsername(userId: string): Promise<string | null> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ public_username: string | null }>("select public_username from public.users where id = $1", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.public_username ?? null;
}

/** Sets (or, with an empty string, clears) the caller's real, chosen, collision-checked
 * public username -- the prerequisite 0049 named before any public-profile page could
 * exist. Throws USERNAME_TAKEN / INVALID_USERNAME via the RPC's own error codes. */
export async function setMyPublicUsername(username: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.set_my_public_username", [username]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

type PublicResearcherProfile_DB = {
  researcher_id: string;
  display_name: string;
  public_username: string;
  biography: string | null;
  hacking_interests: PublicResearcherProfile["hackingInterests"];
  security_focus: PublicResearcherProfile["securityFocus"];
  score: number;
  resolved_count: number;
  bounty_finalized_count: number;
};

/** The public researcher profile at a real public_username -- public-callable, and
 * returns null identically for "no such username" and "exists but has no public profile
 * set," never distinguishing the two (see 0065). */
export async function getPublicResearcherProfile(username: string): Promise<PublicResearcherProfile | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<PublicResearcherProfile_DB>(client, "public.get_public_researcher_profile", [username]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  return {
    researcherId: row.researcher_id,
    displayName: row.display_name,
    publicUsername: row.public_username,
    biography: row.biography,
    hackingInterests: row.hacking_interests ?? [],
    securityFocus: row.security_focus ?? [],
    score: row.score,
    resolvedCount: row.resolved_count,
    bountyFinalizedCount: row.bounty_finalized_count,
  };
}

type ResearcherBadge_DB = { badge_key: ResearcherBadge["badgeKey"]; tier: ResearcherBadge["tier"]; current_value: number; next_threshold: number | null };

/** Any researcher's own real, computed badge tiers (docs/decisions/0071) -- public-
 * callable, matching get_researcher_reputation_score's own grants (badges appear on the
 * public profile page). A badge family with zero progress is simply absent, never a
 * "tier: none" row. */
export async function getResearcherBadges(researcherId: string): Promise<ResearcherBadge[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<ResearcherBadge_DB>(client, "public.get_researcher_badges", [researcherId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    badgeKey: row.badge_key,
    tier: row.tier,
    currentValue: row.current_value,
    nextThreshold: row.next_threshold,
  }));
}
