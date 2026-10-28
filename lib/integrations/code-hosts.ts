import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { safeFetch } from "./safe-fetch";

// GitHub (GitHub App) and GitLab (project or group access token) clients for issue sync
// (202610290004). No SDK: a few REST calls. Shared by the app server and the outbox worker.
//
// Never publish a vulnerability: issueTarget() is checked immediately before every issue is
// created, and only a PRIVATE repository / project passes. GitLab "internal" (visible to every
// signed-in user of the instance) is refused too.

export class CodeHostError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// ---------------------------------------------------------------- GitHub
export type GitHubAppConfig = { appId: string; slug: string; privateKey: string; clientId: string; clientSecret: string; webhookSecret: string; apiBase: string };

export function githubAppConfig(env: NodeJS.ProcessEnv = process.env): GitHubAppConfig | null {
  const need = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET"] as const;
  if (need.some((k) => !env[k]?.trim())) return null;
  // GITHUB_API_BASE lets the end-to-end tests point at a local fake; never in production.
  const apiBase = env.NODE_ENV !== "production" && env.GITHUB_API_BASE ? env.GITHUB_API_BASE : "https://api.github.com";
  return { appId: env.GITHUB_APP_ID!, slug: env.GITHUB_APP_SLUG!, privateKey: env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"), clientId: env.GITHUB_APP_CLIENT_ID!, clientSecret: env.GITHUB_APP_CLIENT_SECRET!, webhookSecret: env.GITHUB_WEBHOOK_SECRET!, apiBase };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The app's own JWT (RS256, 9 minutes), used only to mint installation tokens. */
export function githubAppJwt(cfg: GitHubAppConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: cfg.appId }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(cfg.privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

async function gh<T>(cfg: GitHubAppConfig, path: string, init: { method?: "GET" | "POST" | "PATCH"; token: string; body?: unknown; bearerKind?: "Bearer" | "token" }): Promise<T> {
  const res = await safeFetch(`${cfg.apiBase}${path}`, {
    method: init.method ?? "GET",
    headers: { accept: "application/vnd.github+json", authorization: `${init.bearerKind ?? "Bearer"} ${init.token}`, "x-github-api-version": "2022-11-28", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status < 200 || res.status >= 300) throw new CodeHostError(`GitHub answered HTTP ${res.status}`, res.status);
  return (res.body ? JSON.parse(res.body) : {}) as T;
}

export async function githubInstallationToken(cfg: GitHubAppConfig, installationId: string): Promise<string> {
  const r = await gh<{ token: string }>(cfg, `/app/installations/${encodeURIComponent(installationId)}/access_tokens`, { method: "POST", token: githubAppJwt(cfg) });
  return r.token;
}

/** Install callback: proves the signed-in GitHub user can access this installation. */
export async function githubVerifyInstallation(cfg: GitHubAppConfig, code: string, installationId: string): Promise<{ accountLogin: string }> {
  const exchange = await safeFetch(cfg.apiBase === "https://api.github.com" ? "https://github.com/login/oauth/access_token" : `${cfg.apiBase}/login/oauth/access_token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }),
  });
  const userToken = (JSON.parse(exchange.body || "{}") as { access_token?: string }).access_token;
  if (!userToken) throw new CodeHostError("GitHub did not confirm who installed the app.");
  const list = await gh<{ installations: { id: number; account: { login: string } }[] }>(cfg, "/user/installations?per_page=100", { token: userToken });
  const match = list.installations.find((i) => String(i.id) === installationId);
  if (!match) throw new CodeHostError("That GitHub installation isn't one you can access.");
  return { accountLogin: match.account.login };
}

export type RepoInfo = { id: string; fullName: string; private: boolean; url: string };

export async function githubListRepos(cfg: GitHubAppConfig, installationId: string): Promise<RepoInfo[]> {
  const token = await githubInstallationToken(cfg, installationId);
  const r = await gh<{ repositories: { id: number; full_name: string; private: boolean; html_url: string }[] }>(cfg, "/installation/repositories?per_page=100", { token });
  return r.repositories.map((x) => ({ id: String(x.id), fullName: x.full_name, private: x.private, url: x.html_url }));
}

export async function githubRepo(cfg: GitHubAppConfig, token: string, fullName: string): Promise<RepoInfo> {
  const x = await gh<{ id: number; full_name: string; private: boolean; html_url: string }>(cfg, `/repos/${fullName.split("/").map(encodeURIComponent).join("/")}`, { token });
  return { id: String(x.id), fullName: x.full_name, private: x.private, url: x.html_url };
}

export async function githubCreateIssue(cfg: GitHubAppConfig, token: string, fullName: string, title: string, body: string): Promise<{ number: number; url: string }> {
  const r = await gh<{ number: number; html_url: string }>(cfg, `/repos/${fullName.split("/").map(encodeURIComponent).join("/")}/issues`, { method: "POST", token, body: { title, body, labels: ["security"] } });
  return { number: r.number, url: r.html_url };
}

export async function githubCommentAndClose(cfg: GitHubAppConfig, token: string, fullName: string, number: number, comment: string, close: boolean): Promise<void> {
  const repo = fullName.split("/").map(encodeURIComponent).join("/");
  await gh(cfg, `/repos/${repo}/issues/${number}/comments`, { method: "POST", token, body: { body: comment } });
  if (close) await gh(cfg, `/repos/${repo}/issues/${number}`, { method: "PATCH", token, body: { state: "closed", state_reason: "completed" } });
}

/** X-Hub-Signature-256: "sha256=" + hex HMAC of the raw body. */
export function verifyGithubSignature(secret: string, raw: Buffer, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// ---------------------------------------------------------------- GitLab
async function gl<T>(baseUrl: string, token: string, path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown } = {}): Promise<T> {
  const res = await safeFetch(`${baseUrl.replace(/\/$/, "")}/api/v4${path}`, {
    method: init.method ?? "GET",
    headers: { "private-token": token, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new CodeHostError("GitLab refused the token. Check it has the api scope and at least Reporter access.", res.status);
  if (res.status < 200 || res.status >= 300) throw new CodeHostError(`GitLab answered HTTP ${res.status}`, res.status);
  return (res.body ? JSON.parse(res.body) : {}) as T;
}

export async function gitlabProject(baseUrl: string, token: string, pathOrId: string): Promise<RepoInfo> {
  const p = await gl<{ id: number; path_with_namespace: string; visibility: string; web_url: string }>(baseUrl, token, `/projects/${encodeURIComponent(pathOrId)}`);
  return { id: String(p.id), fullName: p.path_with_namespace, private: p.visibility === "private", url: p.web_url };
}

export async function gitlabCheckToken(baseUrl: string, token: string): Promise<void> {
  await gl(baseUrl, token, "/projects?membership=true&per_page=1");
}

export async function gitlabCreateIssue(baseUrl: string, token: string, projectId: string, title: string, description: string): Promise<{ number: number; url: string }> {
  const r = await gl<{ iid: number; web_url: string }>(baseUrl, token, `/projects/${encodeURIComponent(projectId)}/issues`, { method: "POST", body: { title, description, labels: "security", confidential: true } });
  return { number: r.iid, url: r.web_url };
}

export async function gitlabCommentAndClose(baseUrl: string, token: string, projectId: string, iid: number, comment: string, close: boolean): Promise<void> {
  await gl(baseUrl, token, `/projects/${encodeURIComponent(projectId)}/issues/${iid}/notes`, { method: "POST", body: { body: comment } });
  if (close) await gl(baseUrl, token, `/projects/${encodeURIComponent(projectId)}/issues/${iid}`, { method: "PUT", body: { state_event: "close" } });
}

export function verifyGitlabToken(secret: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- shared
export type IssueContext = { title: string; description: string; impact: string | null; severity: string | null; weakness: string | null; target: string; programName: string; reportUrl: string };

/** The issue body: the vulnerability details, for a private repository only. */
export function issueBody(ctx: IssueContext): string {
  return [
    `**Severity:** ${ctx.severity ?? "not set"}`,
    `**Target:** ${ctx.target}`,
    `**Category:** ${ctx.weakness ?? "not specified"}`,
    `**Program:** ${ctx.programName}`,
    `**Report:** ${ctx.reportUrl}`,
    "",
    "## Description",
    ctx.description,
    ...(ctx.impact ? ["", "## Impact", ctx.impact] : []),
    "",
    "_Synced from Unpatched. Keep this repository private: it describes an unfixed vulnerability._",
  ].join("\n");
}
