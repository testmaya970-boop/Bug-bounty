import { createHmac, generateKeyPairSync, createVerify } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  githubAppJwt,
  githubCreateIssue,
  githubRepo,
  gitlabCreateIssue,
  gitlabProject,
  issueBody,
  verifyGithubSignature,
  verifyGitlabToken,
  type GitHubAppConfig,
} from "../../lib/integrations/code-hosts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

describe("GitHub App auth and webhooks", () => {
  it("the app JWT is RS256, short-lived, and verifies with the app's public key", () => {
    const cfg = { appId: "123", privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString() } as GitHubAppConfig;
    const jwt = githubAppJwt(cfg, 1_800_000_000);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(claims).toMatchObject({ iss: "123", iat: 1_800_000_000 - 60, exp: 1_800_000_000 + 540 });
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("webhook signatures must match the raw body exactly", () => {
    const body = Buffer.from('{"action":"closed"}');
    const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
    expect(verifyGithubSignature("s3cret", body, sig)).toBe(true);
    expect(verifyGithubSignature("s3cret", Buffer.from('{"action":"opened"}'), sig)).toBe(false);
    expect(verifyGithubSignature("other", body, sig)).toBe(false);
    expect(verifyGithubSignature("s3cret", body, null)).toBe(false);
    expect(verifyGitlabToken("abc", "abc")).toBe(true);
    expect(verifyGitlabToken("abc", "abd")).toBe(false);
    expect(verifyGitlabToken("abc", null)).toBe(false);
  });

  it("the issue body carries the details and a reminder to keep the repository private", () => {
    const b = issueBody({ title: "t", description: "SQLi in /search", impact: "data", severity: "high", weakness: "SQL injection", target: "api.acme.example", programName: "Acme", reportUrl: "https://app/r" });
    expect(b).toContain("SQLi in /search");
    expect(b).toContain("Keep this repository private");
  });
});

describe("provider calls against a local fake API (the real client code path)", () => {
  let server: Server;
  let base = "";
  const seen: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.ALLOW_LOOPBACK_DELIVERY = "1";
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
        res.setHeader("content-type", "application/json");
        if (req.url === "/repos/acme/secret") return res.end(JSON.stringify({ id: 1, full_name: "acme/secret", private: true, html_url: "https://github.com/acme/secret" }));
        if (req.url === "/repos/acme/open") return res.end(JSON.stringify({ id: 2, full_name: "acme/open", private: false, html_url: "https://github.com/acme/open" }));
        if (req.url === "/repos/acme/secret/issues") return res.end(JSON.stringify({ number: 42, html_url: "https://github.com/acme/secret/issues/42" }));
        if (req.url?.startsWith("/api/v4/projects/grp%2Fapp")) return res.end(JSON.stringify({ id: 7, path_with_namespace: "grp/app", visibility: "internal", web_url: "https://gl/grp/app" }));
        if (req.url === "/api/v4/projects/7/issues") return res.end(JSON.stringify({ iid: 3, web_url: "https://gl/grp/app/-/issues/3" }));
        if (req.url?.startsWith("/api/v4/projects/denied")) {
          res.statusCode = 403;
          return res.end("{}");
        }
        res.statusCode = 404;
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => {
    server.close();
    process.env = saved;
  });

  it("GitHub: private and public repositories are told apart; issues are created with the token", async () => {
    const cfg = { apiBase: base } as GitHubAppConfig;
    expect((await githubRepo(cfg, "tok", "acme/secret")).private).toBe(true);
    expect((await githubRepo(cfg, "tok", "acme/open")).private).toBe(false);
    const issue = await githubCreateIssue(cfg, "tok", "acme/secret", "[Unpatched] x", "body");
    expect(issue).toEqual({ number: 42, url: "https://github.com/acme/secret/issues/42" });
    expect(seen.at(-1)!.headers.authorization).toBe("Bearer tok");
  });

  it("GitLab: internal counts as not private; issues are confidential; a refused token says why", async () => {
    expect((await gitlabProject(base, "glpat-x", "grp/app")).private).toBe(false);
    await gitlabCreateIssue(base, "glpat-x", "7", "t", "d");
    expect(JSON.parse(seen.at(-1)!.body)).toMatchObject({ confidential: true });
    expect(seen.at(-1)!.headers["private-token"]).toBe("glpat-x");
    await expect(gitlabProject(base, "bad", "denied")).rejects.toThrow(/refused the token/);
  });
});
