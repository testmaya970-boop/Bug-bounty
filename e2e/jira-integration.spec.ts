import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Jira Cloud integration (db/migrations/202610010001_jira_integration.sql), end to end
// against the real prod build + real Postgres, in its own seeded organization (E2E
// Integrations Org -- see scripts/seed-e2e.ts ensureIntegrationsOrg) so a connected Jira
// can't touch any other spec's report events.
//
// There is no real Jira Cloud site here, so two things are deliberately simulated, and
// only these two:
//   1. The report -> issue link row is INSERTED DIRECTLY (as service_role), standing in for
//      what the outbox consumer writes after Jira's create-issue call succeeds.
//   2. Jira's webhook delivery is a request this test signs itself, with the secret the UI
//      showed once -- exactly the X-Hub-Signature HMAC Jira computes.
// Everything else (the settings UI, the RPCs, encryption, the webhook route's signature
// check, and resolve_report running as the connecting admin) is the real code path.
//
// After the inbound resolve, the real outbox worker may make one outbound call to the
// fictitious site below before the test disconnects; it fails (no such site / bad token)
// and is harmless -- after disconnect the consumer finds no connection and no-ops.

const PASSWORD = "E2ESeed!2026";
const ADMIN = "e2e.integrations-admin@unpatched.demo";
const SITE = "https://unpatched-e2e-fixture.atlassian.net";
const TOKEN = "ATATT3xFfGF0e2eFixtureTokenNotRealWXYZ";
const SHOTS = process.env.E2E_SCREENSHOT_DIR;

const fixture = () =>
  JSON.parse(readFileSync(path.join(process.cwd(), "e2e", ".seed-fixture.json"), "utf-8")) as {
    integrationsOrganizationId: string;
    integrationsProgramId: string;
    integrationsReportId: string;
  };

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
  const match = /^DATABASE_URL=(.+)$/m.exec(env);
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

async function asServiceRole<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
    await client.query("set local role service_role");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

const shot = async (page: Page, name: string, target?: ReturnType<Page["locator"]>) => {
  if (!SHOTS) return;
  await (target ?? page).screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

test("owner connects Jira, sees it persisted and masked, edits it, receives a signed status change, and disconnects", async ({ page, request }) => {
  const { integrationsOrganizationId: orgId, integrationsProgramId: programId, integrationsReportId: reportId } = fixture();
  await signIn(page, ADMIN);
  await page.goto(`/organizations/${orgId}/settings`);

  const section = page.locator("#integrations");
  await expect(section.getByRole("heading", { name: "Jira Cloud" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Connect Jira" })).toBeVisible();
  await shot(page, "jira-settings-empty", section);

  // A non-Atlassian host is refused by the RPC (SSRF guard), and the message lands under
  // the site field.
  await section.getByLabel("Jira site URL").fill("https://169.254.169.254");
  await section.getByLabel("Account email").fill("security-bot@acme.test");
  await section.getByLabel("API token").fill(TOKEN);
  await section.getByLabel("Project key").fill("sec");
  await section.getByRole("button", { name: "Connect Jira" }).click();
  await expect(section.getByText("Use your Jira Cloud site address")).toBeVisible();

  await section.getByLabel("Jira site URL").fill(`${SITE}/`);
  await section.getByRole("button", { name: "Connect Jira" }).click();

  // The webhook secret is shown exactly once, with the setup steps.
  const setup = page.getByTestId("jira-webhook-setup");
  await expect(setup).toBeVisible();
  const secret = (await setup.locator("code").nth(2).textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[0-9a-f]{64}$/);
  await expect(setup.getByText(`/api/webhooks/jira/${orgId}`)).toBeVisible();
  await expect(setup.getByText("project = SEC")).toBeVisible();

  const status = page.getByTestId("jira-connection-status");
  await expect(status.getByText("Connected", { exact: true })).toBeVisible();
  await expect(status.getByText("•••• WXYZ")).toBeVisible();
  await expect(status.getByText("SEC", { exact: true })).toBeVisible();
  await expect(status.getByText("E2E Integrations Admin")).toBeVisible();
  await shot(page, "jira-settings-connected-first-time", section);

  // Persisted across a reload; the secret and the full token are never sent again.
  await page.reload();
  await expect(page.getByTestId("jira-connection-status").getByText("•••• WXYZ")).toBeVisible();
  await expect(page.getByTestId("jira-webhook-setup")).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain(TOKEN);
  expect(html).not.toContain(secret);
  await shot(page, "jira-settings-connected", page.locator("#integrations"));

  // Edit in place: blank token keeps the stored one; site is immutable.
  await page.getByRole("button", { name: "Edit connection" }).click();
  await expect(page.locator("#integrations").getByLabel("Jira site URL")).toBeDisabled();
  await page.locator("#integrations").getByLabel("Project key").fill("APPSEC");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("jira-connection-status").getByText("APPSEC", { exact: true })).toBeVisible();
  await expect(page.getByTestId("jira-connection-status").getByText("•••• WXYZ")).toBeVisible();

  // ---- Simulated #1: the link the outbox consumer would write after creating SEC-42. ----
  await asServiceRole((db) => db.query("select public.record_report_jira_sync($1, $2, $3)", [reportId, "10042", "SEC-42"]));

  await page.goto(`/organizations/${orgId}/programs/${programId}/reports/${reportId}`);
  const jiraLink = page.getByRole("link", { name: "View in Jira: SEC-42 →" });
  await expect(jiraLink).toBeVisible();
  await expect(jiraLink).toHaveAttribute("href", `${SITE}/browse/SEC-42`);
  await shot(page, "report-view-in-jira", page.locator("main"));

  // ---- Simulated #2: Jira's signed webhook for "SEC-42 moved to Done". ----
  const body = JSON.stringify({
    timestamp: Date.now(),
    webhookEvent: "jira:issue_updated",
    issue_event_type_name: "issue_generic",
    user: { accountId: "5b10a2844c20165700ede21g", displayName: "Priya (Platform Eng)" },
    issue: { id: "10042", key: "SEC-42", fields: { status: { name: "Done", statusCategory: { id: 3, key: "done", name: "Done" } }, resolution: { name: "Done" } } },
    changelog: { id: "10500", items: [{ field: "status", fieldtype: "jira", fromString: "In Progress", toString: "Done" }] },
  });
  const url = `/api/webhooks/jira/${orgId}`;
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  const forged = await request.post(url, { data: body, headers: { "content-type": "application/json", "x-hub-signature": `sha256=${"0".repeat(64)}` } });
  expect(forged.status()).toBe(401);
  expect(await forged.text()).toBe("");
  const unsigned = await request.post(url, { data: body, headers: { "content-type": "application/json" } });
  expect(unsigned.status()).toBe(401);
  const otherOrg = await request.post(`/api/webhooks/jira/00000000-0000-4000-8000-000000000000`, { data: body, headers: { "content-type": "application/json", "x-hub-signature": signature } });
  expect(otherOrg.status()).toBe(401);
  expect(await otherOrg.text()).toBe("");

  const genuine = await request.post(url, { data: body, headers: { "content-type": "application/json", "x-hub-signature": signature } });
  expect(genuine.status()).toBe(204);

  await page.reload();
  await expect(page.getByText('Resolved in Jira: SEC-42 moved to "Done" (resolution: Done) by Priya (Platform Eng).')).toBeVisible();
  // Went through resolve_report as the connecting admin: same audit row a human click writes.
  const audit = await asServiceRole((db) =>
    db.query<{ email: string }>(
      "select u.email from public.audit_logs a join public.users u on u.id = a.actor_id where a.entity_id = $1 and a.action = 'report.resolved' order by a.created_at desc limit 1",
      [reportId],
    ),
  );
  expect(audit.rows[0]?.email).toBe(ADMIN);

  // Disconnect through the real confirm dialog.
  await page.goto(`/organizations/${orgId}/settings`);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect Jira?" });
  await expect(dialog.getByText("links from 1 report to their issues are removed")).toBeVisible();
  await dialog.getByRole("button", { name: "Disconnect Jira" }).click();
  await expect(page.locator("#integrations").getByRole("button", { name: "Connect Jira" })).toBeVisible();

  const remaining = await asServiceRole((db) =>
    db.query<{ connections: string; links: string }>(
      "select (select count(*) from public.jira_connections where organization_id = $1) as connections, (select count(*) from public.report_jira_links where organization_id = $1) as links",
      [orgId],
    ),
  );
  expect(remaining.rows[0]).toEqual({ connections: "0", links: "0" });
  // With the connection gone, the old secret no longer verifies anything.
  expect((await request.post(url, { data: body, headers: { "content-type": "application/json", "x-hub-signature": signature } })).status()).toBe(401);
});

test("a triager sees no Jira controls in organization settings", async ({ page }) => {
  const { organizationId } = JSON.parse(readFileSync(path.join(process.cwd(), "e2e", ".seed-fixture.json"), "utf-8")) as { organizationId: string };
  await signIn(page, "e2e.triager@unpatched.demo");
  await page.goto(`/organizations/${organizationId}/settings`);
  const section = page.locator("#integrations");
  await expect(section.getByText("Only an owner or security admin can connect or manage integrations.")).toBeVisible();
  await expect(section.getByRole("button")).toHaveCount(0);
  await expect(section.getByLabel("API token")).toHaveCount(0);
});
