import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { withActorTransaction, withServiceRoleTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNativeEnv } from "@/lib/env";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import { checkOutboundUrl, UnsafeUrlError } from "@/lib/integrations/safe-fetch";
import {
  CodeHostError,
  githubAppConfig,
  githubCreateIssue,
  githubInstallationToken,
  githubListRepos,
  githubRepo,
  githubVerifyInstallation,
  gitlabCheckToken,
  gitlabCreateIssue,
  gitlabProject,
  issueBody,
  type RepoInfo,
} from "@/lib/integrations/code-hosts";
import { weaknessTypeLabel } from "@/lib/report-weakness-labels";
import type { ReportWeaknessType } from "@/types/report";

// GitHub and GitLab issue sync (202610290004). Authorization lives in the database functions;
// this file does what only the server can: talk to the provider, and refuse anything but a
// private repository before a single detail of a vulnerability leaves Unpatched.

export type CodeHostConnection = { id: string; provider: "github" | "gitlab"; status: "active" | "error"; accountLabel: string; gitlabBaseUrl: string | null; tokenLast4: string | null; lastError: string | null; createdAt: string };
export type ProgramRepository = { programId: string; provider: "github" | "gitlab"; repoFullName: string; repoUrl: string };
export type ReportIssueLink = { provider: "github" | "gitlab"; repoFullName: string; issueNumber: number; issueUrl: string; state: "open" | "closed" };

const hashState = (s: string) => createHash("sha256").update(s).digest("hex");
const origin = () => getNativeEnv().APP_ORIGIN.replace(/\/$/, "");

async function actor(): Promise<string> {
  const u = await getCurrentUser();
  if (!u) throw new OrganizationServiceError("Sign in again to continue.", "AUTH_REQUIRED");
  return u.id;
}

async function asActor<T>(fn: Parameters<typeof withActorTransaction<T>>[1]): Promise<T> {
  const id = await actor();
  try {
    return await withActorTransaction(id, fn);
  } catch (error) {
    mapError(error as { message: string });
  }
}

async function assertAdmin(organizationId: string): Promise<void> {
  const ok = await asActor((c) => c.query<{ ok: boolean }>("select private.has_org_role($1, array['owner', 'security_admin']::public.organization_member_role[]) as ok", [organizationId]).then((r) => r.rows[0]?.ok === true));
  if (!ok) throw new OrganizationServiceError("Only an owner or security admin can manage integrations.", "FORBIDDEN");
}

function providerError(error: unknown): OrganizationServiceError {
  if (error instanceof CodeHostError || error instanceof UnsafeUrlError) return new OrganizationServiceError(error.message, "PROVIDER_ERROR");
  return new OrganizationServiceError("The provider could not be reached. Try again in a minute.", "PROVIDER_ERROR");
}

export function githubAppAvailable(): boolean {
  return githubAppConfig() !== null;
}

// Reads ------------------------------------------------------------------------------------------
export async function getCodeHostState(organizationId: string): Promise<{ connections: CodeHostConnection[]; repositories: ProgramRepository[] }> {
  type C = { id: string; provider: "github" | "gitlab"; status: "active" | "error"; account_label: string; gitlab_base_url: string | null; token_last4: string | null; last_error: string | null; created_at: string };
  type R = { program_id: string; provider: "github" | "gitlab"; repo_full_name: string; repo_url: string };
  return asActor(async (c) => {
    const conns = await c.query<C>("select id, provider, status, account_label, gitlab_base_url, token_last4, last_error, created_at from public.code_host_connections where organization_id = $1", [organizationId]);
    const repos = await c.query<R>("select pr.program_id, pr.provider, pr.repo_full_name, pr.repo_url from public.program_repositories pr join public.programs p on p.id = pr.program_id where p.organization_id = $1", [organizationId]);
    return {
      connections: conns.rows.map((r) => ({ id: r.id, provider: r.provider, status: r.status, accountLabel: r.account_label, gitlabBaseUrl: r.gitlab_base_url, tokenLast4: r.token_last4, lastError: r.last_error, createdAt: new Date(r.created_at).toISOString() })),
      repositories: repos.rows.map((r) => ({ programId: r.program_id, provider: r.provider, repoFullName: r.repo_full_name, repoUrl: r.repo_url })),
    };
  });
}

export async function listReportIssueLinks(reportId: string): Promise<ReportIssueLink[]> {
  type R = { provider: "github" | "gitlab"; repo_full_name: string; issue_number: number; issue_url: string; state: "open" | "closed" };
  const rows = await asActor((c) => c.query<R>("select provider, repo_full_name, issue_number, issue_url, state from public.report_issue_links where report_id = $1", [reportId]).then((r) => r.rows));
  return rows.map((r) => ({ provider: r.provider, repoFullName: r.repo_full_name, issueNumber: r.issue_number, issueUrl: r.issue_url, state: r.state }));
}

type Creds = { provider: "github" | "gitlab"; organization_id: string; github_installation_id: string | null; gitlab_base_url: string | null; token: string | null; webhook_secret: string | null; created_by: string };
async function credentials(connectionId: string): Promise<Creds> {
  const [row] = await withServiceRoleTransaction((c) => callRpc<Creds>(c, "private.code_host_credentials", [connectionId]));
  if (!row) throw new OrganizationServiceError("That connection no longer exists.", "NOT_FOUND");
  return row;
}

// GitHub App install -----------------------------------------------------------------------------
export async function startGithubInstall(organizationId: string): Promise<string> {
  const cfg = githubAppConfig();
  if (!cfg) throw new OrganizationServiceError("The Unpatched GitHub App isn't set up on this server.", "NOT_AVAILABLE");
  await assertAdmin(organizationId);
  const state = randomBytes(24).toString("base64url");
  const id = await actor();
  await withServiceRoleTransaction((c) => c.query("insert into public.integration_oauth_states (state_hash, provider, organization_id, user_id) values ($1, 'github', $2, $3)", [hashState(state), organizationId, id]));
  return `https://github.com/apps/${encodeURIComponent(cfg.slug)}/installations/new?state=${encodeURIComponent(state)}`;
}

/** GitHub's Setup URL callback. Requires "Request user authorization (OAuth) during installation"
 * on the app, so GitHub returns a code that proves who installed it. */
export async function completeGithubInstall(params: URLSearchParams): Promise<{ organizationId: string | null; error: string | null }> {
  const cfg = githubAppConfig();
  const u = await getCurrentUser();
  const state = params.get("state") ?? "";
  if (!cfg || !u || !state) return { organizationId: null, error: "Sign in and start the GitHub connection again." };
  const row = await withServiceRoleTransaction((c) =>
    c.query<{ organization_id: string }>("delete from public.integration_oauth_states where state_hash = $1 and user_id = $2 and provider = 'github' and created_at > now() - interval '1 hour' returning organization_id", [hashState(state), u.id]).then((r) => r.rows[0]),
  );
  if (!row) return { organizationId: null, error: "That GitHub link expired or was already used. Start again." };
  const installationId = params.get("installation_id") ?? "";
  const code = params.get("code") ?? "";
  if (!/^[0-9]{1,20}$/.test(installationId) || !code) return { organizationId: row.organization_id, error: "GitHub did not return the installation. Check the app requests user authorization during installation." };
  try {
    const { accountLogin } = await githubVerifyInstallation(cfg, code, installationId);
    await withServiceRoleTransaction((c) => callRpc(c, "private.create_github_connection", [row.organization_id, u.id, installationId, accountLogin]));
  } catch (error) {
    return { organizationId: row.organization_id, error: error instanceof Error ? error.message.replace(/^[A-Z_]+: /, "") : "GitHub could not be connected." };
  }
  return { organizationId: row.organization_id, error: null };
}

export async function listGithubRepositories(organizationId: string, connectionId: string): Promise<RepoInfo[]> {
  const cfg = githubAppConfig();
  if (!cfg) return [];
  await assertAdmin(organizationId);
  const creds = await credentials(connectionId);
  if (creds.organization_id !== organizationId || !creds.github_installation_id) return [];
  try {
    return await githubListRepos(cfg, creds.github_installation_id);
  } catch {
    return [];
  }
}

// GitLab ----------------------------------------------------------------------------------------
/** Returns the webhook URL and its secret token, shown once. */
export async function connectGitlab(organizationId: string, baseUrlInput: string, token: string): Promise<{ webhookUrl: string; secret: string }> {
  await assertAdmin(organizationId);
  let base: URL;
  try {
    base = checkOutboundUrl(baseUrlInput.trim() || "https://gitlab.com");
  } catch (error) {
    throw providerError(error);
  }
  const baseUrl = `${base.protocol}//${base.host}`;
  try {
    await gitlabCheckToken(baseUrl, token.trim());
  } catch (error) {
    throw providerError(error);
  }
  const secret = randomBytes(24).toString("hex");
  const id = await asActor((c) => callRpc<{ create_gitlab_connection: string }>(c, "public.create_gitlab_connection", [organizationId, baseUrl, token.trim(), secret, base.host]));
  return { webhookUrl: `${origin()}/api/webhooks/gitlab/${id[0].create_gitlab_connection}`, secret };
}

export async function disconnectCodeHost(connectionId: string): Promise<void> {
  await asActor((c) => callRpc(c, "public.delete_code_host_connection", [connectionId]));
}

// Program repository ---------------------------------------------------------------------------------
async function lookupRepo(creds: Creds, ref: string): Promise<RepoInfo> {
  if (creds.provider === "github") {
    const cfg = githubAppConfig();
    if (!cfg || !creds.github_installation_id) throw new OrganizationServiceError("GitHub isn't connected.", "NOT_CONNECTED");
    const token = await githubInstallationToken(cfg, creds.github_installation_id);
    return githubRepo(cfg, token, ref);
  }
  return gitlabProject(creds.gitlab_base_url!, creds.token!, ref);
}

/** Only a private repository can receive vulnerability details. */
export async function setProgramRepository(organizationId: string, programId: string, provider: "github" | "gitlab", repoRef: string): Promise<void> {
  await assertAdmin(organizationId);
  const conn = (await getCodeHostState(organizationId)).connections.find((c) => c.provider === provider);
  if (!conn) throw new OrganizationServiceError(`Connect ${provider === "github" ? "GitHub" : "GitLab"} first.`, "NOT_CONNECTED");
  let repo: RepoInfo;
  try {
    repo = await lookupRepo(await credentials(conn.id), repoRef.trim());
  } catch (error) {
    if (error instanceof OrganizationServiceError) throw error;
    throw providerError(error);
  }
  if (!repo.private) throw new OrganizationServiceError("Only a private repository can receive vulnerability reports. Make it private first, or choose another.", "PUBLIC_REPOSITORY");
  await asActor((c) => callRpc(c, "public.set_program_repository", [programId, provider, repo.id, repo.fullName, repo.url]));
}

export async function clearProgramRepository(programId: string, provider: "github" | "gitlab"): Promise<void> {
  await asActor((c) => callRpc(c, "public.clear_program_repository", [programId, provider]));
}

// Issue creation ------------------------------------------------------------------------------------
type Begin = { connection_id: string; repo_id: string; repo_full_name: string; title: string; description: string; impact: string | null; severity: string | null; weakness: string | null; target: string; program_name: string; organization_id: string; program_id: string };

export async function createReportIssue(reportId: string, provider: "github" | "gitlab"): Promise<ReportIssueLink> {
  const userId = await actor();
  const [b] = await asActor((c) => callRpc<Begin>(c, "public.begin_report_issue", [reportId, provider]));
  const creds = await credentials(b.connection_id);
  try {
    // Visibility is checked again now: a repository made public since it was chosen is refused.
    const repo = await lookupRepo(creds, provider === "github" ? b.repo_full_name : b.repo_id);
    if (!repo.private) throw new OrganizationServiceError("That repository is no longer private, so no issue was created. Choose a private repository in Integrations.", "PUBLIC_REPOSITORY");
    const body = issueBody({
      title: b.title,
      description: b.description,
      impact: b.impact,
      severity: b.severity,
      weakness: b.weakness ? weaknessTypeLabel(b.weakness as ReportWeaknessType) : null,
      target: b.target,
      programName: b.program_name,
      reportUrl: `${origin()}/organizations/${b.organization_id}/programs/${b.program_id}/reports/${reportId}`,
    });
    const title = `[Unpatched] ${b.title}`.slice(0, 250);
    let created: { number: number; url: string };
    if (provider === "github") {
      const cfg = githubAppConfig()!;
      created = await githubCreateIssue(cfg, await githubInstallationToken(cfg, creds.github_installation_id!), repo.fullName, title, body);
    } else {
      created = await gitlabCreateIssue(creds.gitlab_base_url!, creds.token!, repo.id, title, body);
    }
    await withServiceRoleTransaction((c) => callRpc(c, "private.record_report_issue", [reportId, provider, b.connection_id, repo.id, repo.fullName, created.number, created.url, userId]));
    return { provider, repoFullName: repo.fullName, issueNumber: created.number, issueUrl: created.url, state: "open" };
  } catch (error) {
    if (error instanceof OrganizationServiceError) throw error;
    const e = providerError(error);
    await withServiceRoleTransaction((c) => callRpc(c, "private.record_code_host_error", [b.connection_id, e.message])).catch(() => null);
    throw e;
  }
}

// Inbound (verified webhooks) ----------------------------------------------------------------------
/** An issue was closed or reopened at the provider. A close resolves an accepted report through
 * the existing resolve_report, acting as the person who connected the integration, so the same
 * authorization and audit apply as a human click. */
export async function applyIssueState(connectionId: string, repoId: string, issueNumber: number, closed: boolean): Promise<"updated" | "unknown"> {
  type L = { report_id: string; provider: string; created_by: string; report_status: string };
  const link = await withServiceRoleTransaction(async (c) => {
    const r = await c.query<L>(
      `update public.report_issue_links l set state = $4, last_synced_at = now()
         from public.code_host_connections k, public.reports rp
        where l.connection_id = $1 and l.repo_id = $2 and l.issue_number = $3 and k.id = l.connection_id and rp.id = l.report_id
        returning l.report_id, l.provider, k.created_by, rp.status as report_status`,
      [connectionId, repoId, issueNumber, closed ? "closed" : "open"],
    );
    return r.rows[0];
  });
  if (!link) return "unknown";
  if (closed && link.report_status === "accepted") {
    const where = link.provider === "github" ? "GitHub" : "GitLab";
    await withActorTransaction(link.created_by, (c) => callRpc(c, "public.resolve_report", [link.report_id, `Fixed: issue #${issueNumber} was closed in ${where}.`]), { sessionId: "" }).catch(() => null);
  }
  return "updated";
}

/** GitHub says a repository became public: stop sending reports to it at once. */
export async function unlinkPublicRepository(installationId: string, repoId: string): Promise<void> {
  await withServiceRoleTransaction((c) =>
    c.query("delete from public.program_repositories pr using public.code_host_connections k where k.id = pr.connection_id and k.github_installation_id = $1 and pr.repo_id = $2", [installationId, repoId]),
  );
}

export async function githubConnectionForInstallation(installationId: string): Promise<string | null> {
  const r = await withServiceRoleTransaction((c) => c.query<{ id: string }>("select id from public.code_host_connections where github_installation_id = $1", [installationId]).then((x) => x.rows[0]));
  return r?.id ?? null;
}

export async function gitlabWebhookSecret(connectionId: string): Promise<string | null> {
  try {
    const creds = await credentials(connectionId);
    return creds.provider === "gitlab" ? creds.webhook_secret : null;
  } catch {
    return null;
  }
}

/** The report page's issue panel (triage staff, RLS): existing links and which providers this
 * program has a repository for. */
export async function getReportIssuePanel(reportId: string, programId: string): Promise<{ links: ReportIssueLink[]; providers: ("github" | "gitlab")[] }> {
  const [links, providers] = await Promise.all([
    listReportIssueLinks(reportId),
    asActor((c) => c.query<{ provider: "github" | "gitlab" }>("select provider from public.program_repositories where program_id = $1", [programId]).then((r) => r.rows.map((x) => x.provider))),
  ]);
  return { links, providers };
}
