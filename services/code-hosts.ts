import { githubAppConfig } from "../lib/integrations/code-hosts";

export interface CodeHostConnection {
  id: string;
  provider: "github" | "gitlab";
  accountLabel: string;
  tokenLast4: string | null;
  lastError: string | null;
}

export interface ProgramRepository {
  programId: string;
  provider: "github" | "gitlab";
  repoFullName: string;
  repoUrl: string;
}

export interface ReportIssueLink {
  provider: "github" | "gitlab";
  repoFullName: string;
  issueNumber: number;
  issueUrl: string;
  state: string;
}

export function githubAppAvailable(): boolean {
  return Boolean(githubAppConfig());
}

export async function getCodeHostState(_organizationId: string): Promise<{
  connections: CodeHostConnection[];
  repositories: ProgramRepository[];
}> {
  return { connections: [], repositories: [] };
}

export async function listGithubRepositories(
  _organizationId: string,
  _connectionId: string,
): Promise<{ fullName: string; private: boolean }[]> {
  return [];
}

export async function startGithubInstall(
  organizationId: string,
): Promise<string> {
  return `/organizations/${organizationId}/integrations/code`;
}

export async function completeGithubInstall(
  searchParams: URLSearchParams,
): Promise<{ organizationId: string | null; error?: string }> {
  const state = searchParams.get("state");
  const installationId = searchParams.get("installation_id");
  if (!state || !installationId) {
    return {
      organizationId: null,
      error: "Missing GitHub installation parameters.",
    };
  }
  return { organizationId: null };
}

export async function connectGitlab(
  _organizationId: string,
  _baseUrl: string,
  _token: string,
): Promise<{ webhookUrl: string; secret: string }> {
  return { webhookUrl: "", secret: "" };
}

export async function disconnectCodeHost(_connectionId: string): Promise<void> {}

export async function setProgramRepository(
  _organizationId: string,
  _programId: string,
  _provider: "github" | "gitlab",
  _repo: string,
): Promise<void> {}

export async function clearProgramRepository(
  _programId: string,
  _provider: "github" | "gitlab",
): Promise<void> {}

export async function getReportIssuePanel(
  _reportId: string,
  _programId?: string,
): Promise<{
  links: ReportIssueLink[];
  providers: ("github" | "gitlab")[];
}> {
  return { links: [], providers: [] };
}

export async function createReportIssue(
  _reportId: string,
  _provider: "github" | "gitlab",
): Promise<{ issueUrl: string }> {
  return { issueUrl: "" };
}

export async function unlinkPublicRepository(
  _installationId: string,
  _repoId: string,
): Promise<void> {}

export async function githubConnectionForInstallation(
  _installationId: string,
): Promise<string | null> {
  return null;
}

export async function gitlabWebhookSecret(
  _connectionId: string,
): Promise<string | null> {
  return null;
}

export async function applyIssueState(
  _connectionId: string,
  _repoId: string,
  _issueNumber: number,
  _closed: boolean,
): Promise<void> {}
