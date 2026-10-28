import { test, expect, type Page } from "./qa-test";
import { createServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { verifyWebhook } from "../lib/integrations/webhook-signature";
import { passMfaGate } from "./mfa-gate";

// Organization integrations (202610290001-0007) through the real UI, server and worker:
// a signed webhook and a Teams card reach a local receiver, a bonus needs a second approver and
// reaches the researcher, and SSO/SCIM is configured and provisions, then deprovisions, a person.

const PASSWORD = "E2ESeed!2026";
const tag = `${Date.now().toString(36)}`;
const fixture = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const match = new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error(`${name} not found`);
  return match[1].trim();
}
async function owner<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: env("MIGRATION_DATABASE_URL") });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

let server: Server;
let receiverUrl = "";
const received: { headers: Record<string, string>; body: string }[] = [];

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  receiverUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(() => server.close());

test("webhooks and Teams alerts: signed deliveries reach the receiver and show in the log", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${fixture.organizationId}/integrations`);
  await page.getByRole("link", { name: /Webhooks/ }).click();
  await page.getByLabel("Endpoint URL").fill(`${receiverUrl}/hooks/${tag}`);
  await page.getByLabel("Description").fill(`E2E ${tag}`);
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const secret = (await page.locator("code").filter({ hasText: /^whsec_/ }).textContent())!.trim();
  expect(secret).toMatch(/^whsec_/);

  const row = page.getByRole("listitem").filter({ hasText: `/hooks/${tag}` });
  await row.getByRole("button", { name: "Send test" }).click();
  await expect.poll(() => received.find((r) => r.body.includes("integration.test")), { timeout: 30_000 }).toBeTruthy();
  const hit = received.find((r) => r.body.includes("integration.test"))!;
  expect(verifyWebhook(secret, hit.headers, hit.body)).toBe(true);
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "integration.test" }).getByText("Delivered").first()).toBeVisible();

  // Teams: a Workflows URL (a local stand-in in tests) gets an Adaptive Card.
  await page.goto(`/organizations/${fixture.organizationId}/integrations/chat`);
  const teams = page.locator("form").filter({ has: page.getByRole("button", { name: "Connect Teams" }) });
  await teams.getByLabel("Name").fill(`Teams ${tag}`);
  await teams.getByLabel("Teams Workflows URL").fill(`${receiverUrl}/teams/${tag}`);
  await teams.getByRole("button", { name: "Connect Teams" }).click();
  const conn = page.getByRole("listitem").filter({ hasText: `Teams ${tag}` });
  await conn.getByRole("button", { name: "Send test" }).click();
  await expect.poll(() => received.find((r) => r.body.includes("AdaptiveCard")), { timeout: 30_000 }).toBeTruthy();

  // Clean up so later runs start empty.
  await conn.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await page.goto(`/organizations/${fixture.organizationId}/integrations/webhooks`);
  await page.getByRole("listitem").filter({ hasText: `/hooks/${tag}` }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: `/hooks/${tag}` })).toHaveCount(0);
});

test("a bonus needs a second approver, then reaches the researcher as its own payout", async ({ page, browser }) => {
  const report = await owner(async (db) => {
    // Enough balance for the bonus, inside the test's own organization.
    // Shaped like a deposit staff confirmed (reviewed_at dates it in the wallet ledger).
    await db.query("insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_by, reviewed_at) select $1, 'USD', 100000, 'wire', $2, 'confirmed', user_id, user_id, now() from public.organization_members where organization_id = $1 and role = 'owner' limit 1", [fixture.organizationId, `E2E-BONUS-${tag}`]);
    return (await db.query<{ id: string; program_id: string }>("select id, program_id from public.reports where title = 'E2E seed: resolved report with finalized bounty'")).rows[0];
  });
  const reportUrl = `/organizations/${fixture.organizationId}/programs/${report.program_id}/reports/${report.id}`;

  await signIn(page, "e2e.program-manager@unpatched.demo");
  await page.goto(reportUrl);
  await page.getByText("Propose a bonus").click();
  await page.getByLabel("Amount (USD)").fill("12.34");
  await page.getByLabel("Note to the researcher").fill(`Fast retest ${tag}`);
  await page.getByRole("button", { name: "Propose bonus" }).click();
  await expect(page.getByText(/A second owner or security admin approves it/)).toBeVisible();
  await expect(page.getByText("Someone else must approve it.").first()).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "e2e.admin@unpatched.demo");
  await admin.goto(`/organizations/${fixture.organizationId}/payments`);
  const pending = admin.getByRole("region", { name: "Bonuses awaiting approval" }).getByRole("listitem").filter({ hasText: `Fast retest ${tag}` });
  // A click before the page hydrates does nothing; retry until the approval lands.
  await expect(async () => {
    if (await pending.count()) await pending.getByRole("button", { name: "Approve and pay" }).click();
    await expect(pending).toHaveCount(0, { timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  const researcher = await (await browser.newContext()).newPage();
  await signIn(researcher, "e2e.veteran@unpatched.demo");
  await researcher.goto("/settings/payments");
  await expect(researcher.getByRole("listitem").filter({ hasText: "Bonus" }).filter({ hasText: "E2E seed: resolved report with finalized bounty" }).first()).toBeVisible();

  // Leave the seeded award as other specs expect it: one payout row (test-only cleanup).
  await owner(async (db) => {
    await db.query("begin");
    await db.query("set local session_replication_role = replica");
    await db.query("delete from public.payment_obligations where report_id = $1 and bonus_id is not null", [report.id]);
    await db.query("delete from public.report_bonuses where report_id = $1", [report.id]);
    await db.query("commit");
  });
});

test("SSO and SCIM: configure, provision a person, deprovision them; owners are untouchable", async ({ page, request }) => {
  const domain = `sso-${tag}.example`;
  await owner((db) => db.query("insert into public.organization_domains (organization_id, domain, status, verified_at) values ($1, $2, 'verified', now()) on conflict do nothing", [fixture.organizationId, domain]));
  try {
    const dir = mkdtempSync(path.join(tmpdir(), "e2e-idp-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k"), "-out", path.join(dir, "c"), "-days", "2", "-subj", "/CN=e2e-idp"], { stdio: "ignore" });

    await signIn(page, "e2e.admin@unpatched.demo");
    await page.goto(`/organizations/${fixture.organizationId}/integrations/sso`);
    await page.getByLabel("Identity provider entity ID (issuer)").fill("https://idp.e2e.example");
    await page.getByLabel("Single sign-on URL").fill("https://idp.e2e.example/sso");
    await page.getByLabel("Signing certificate").fill(readFileSync(path.join(dir, "c"), "utf8"));
    await page.getByRole("button", { name: "Save single sign-on" }).click();
    await expect(page.getByText("ACS (reply) URL")).toBeVisible();
    await page.getByRole("button", { name: "Turn on single sign-on" }).click();
    await expect(page.getByText("On", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create SCIM token" }).click();
    const token = (await page.locator("code").filter({ hasText: /^scim_/ }).textContent())!.trim();
    const scimBase = (await page.locator("code").filter({ hasText: "/api/scim/v2/" }).textContent())!.trim();
    const path0 = new URL(scimBase).pathname;
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/scim+json" };

    expect((await request.get(`${path0}/Users`, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    const created = await request.post(`${path0}/Users`, { headers: auth, data: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"], userName: `pat@${domain}`, name: { givenName: "Pat", familyName: "Ops" }, active: true } });
    expect(created.status()).toBe(201);
    const user = await created.json();
    expect(user).toMatchObject({ userName: `pat@${domain}`, active: true });
    expect((await request.post(`${path0}/Users`, { headers: auth, data: { userName: `pat@${domain}` } })).status()).toBe(409);
    expect((await request.post(`${path0}/Users`, { headers: auth, data: { userName: "pat@not-verified.example" } })).status()).toBe(400);
    const found = await (await request.get(`${path0}/Users?filter=${encodeURIComponent(`userName eq "pat@${domain}"`)}`, { headers: auth })).json();
    expect(found.totalResults).toBe(1);

    const off = await request.patch(`${path0}/Users/${user.id}`, { headers: auth, data: { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", path: "active", value: false }] } });
    expect((await off.json()).active).toBe(false);
    const ownerId = await owner(async (db) => (await db.query<{ user_id: string }>("select user_id from public.organization_members where organization_id = $1 and role = 'owner' limit 1", [fixture.organizationId])).rows[0].user_id);
    expect((await request.delete(`${path0}/Users/${ownerId}`, { headers: auth })).status()).toBe(403);

    // "Sign in with SSO" sends a person on the verified domain to the identity provider.
    const go = await request.get(`/api/sso/saml/start?email=${encodeURIComponent(`pat@${domain}`)}`, { maxRedirects: 0 });
    expect(go.status()).toBeGreaterThanOrEqual(300);
    expect(go.headers().location).toMatch(/^https:\/\/idp\.e2e\.example\/sso\?SAMLRequest=/);

    // Clean up: remove SSO and the test domain.
    await page.getByRole("button", { name: "Remove single sign-on" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove single sign-on" }).click();
    await expect(page.getByRole("button", { name: "Save single sign-on" })).toBeVisible();
  } finally {
    // Even if a step failed: no SSO set-up or test domain survives into other specs.
    await owner(async (db) => {
      await db.query("delete from public.sso_connections where organization_id = $1", [fixture.organizationId]);
      await db.query("delete from public.organization_domains where organization_id = $1 and domain = $2", [fixture.organizationId, domain]);
    });
  }
});
