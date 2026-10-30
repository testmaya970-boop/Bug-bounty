import { test, expect, type Browser, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { passMfaGate } from "./mfa-gate";

// Managed Triage and Analytics & Reporting (202610290008-0009) through the real UI, server and
// worker: an owner buys the service, a platform admin activates it (charging the balance), an
// analyst claims, validates and escalates a report, the owner answers; then the owner filters
// the Explore view, downloads every export format and gets a scheduled export from the worker.

const PASSWORD = "E2ESeed!2026";
const OWNER = "e2e.admin@unpatched.demo";
const ADMIN = "e2e.platform-admin@unpatched.demo";
const ANALYST = "e2e.analyst@unpatched.demo";
const fixture = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };
const ORG = fixture.organizationId;

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

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  return page;
}

async function resetManagedTriage() {
  await owner(async (db) => {
    for (const table of ["managed_triage_claims", "report_triage_escalations", "report_triage_assessments", "managed_triage_subscriptions", "organization_service_charges", "analytics_export_schedules"]) {
      await db.query(`delete from public.${table} where organization_id = $1`, [ORG]);
    }
    await db.query("delete from public.organization_deposits where payer_reference like 'E2E-MT-%'");
  });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(resetManagedTriage);
test.afterAll(resetManagedTriage);

test("Managed Triage: buy, activate, analyst triages and escalates, the owner answers", async ({ browser }) => {
  test.setTimeout(240_000);
  // Enough prepaid balance for the first month.
  await owner((db) =>
    db.query(
      "insert into public.organization_deposits (organization_id, currency, amount_minor_units, method, payer_reference, status, requested_by, reviewed_at) select $1, 'USD', 200000, 'wire', 'E2E-MT-' || gen_random_uuid(), 'confirmed', (select id from public.users where email = $2), now()",
      [ORG, OWNER],
    ),
  );
  const report = await owner((db) => db.query<{ id: string; program_id: string; title: string }>("select id, program_id, title from public.reports where organization_id = $1 and status = 'new' order by submitted_at desc limit 1", [ORG]).then((r) => r.rows[0]));
  expect(report, "the seed has a new report to triage").toBeTruthy();

  // The owner requests the Standard plan.
  const org = await signedIn(browser, OWNER);
  await org.goto(`/organizations/${ORG}/managed-triage`);
  await expect(async () => {
    await org.getByRole("button", { name: "Request Managed Triage" }).click();
    await expect(org.getByText("Waiting for Unpatched to confirm")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

  // A platform admin activates it: the first month comes off the balance.
  const admin = await signedIn(browser, ADMIN);
  await admin.goto("/platform/managed-triage");
  await expect(async () => {
    // Other organizations may have pending requests too: act on this one's row only.
    const row = admin.getByRole("listitem").filter({ hasText: "E2E Journey Org" }).first();
    await row.getByRole("button", { name: "Activate and charge first month" }).click();
    await expect(row.getByText("active", { exact: true })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  const charged = await owner((db) => db.query("select amount_minor_units from public.organization_service_charges where organization_id = $1", [ORG]).then((r) => r.rows));
  expect(charged).toEqual([{ amount_minor_units: "150000" }]);

  // The analyst claims the report from the queue, records a validation and asks the organization.
  const analyst = await signedIn(browser, ANALYST);
  await analyst.goto("/triage?view=all");
  const row = analyst.getByRole("listitem").filter({ hasText: report.title });
  await expect(row).toBeVisible();
  await expect(async () => {
    await row.getByRole("button", { name: "Claim" }).click();
    await expect(row.getByText("Yours")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await row.getByRole("link", { name: report.title }).click();
  await expect(analyst.getByText("You are working this report")).toBeVisible();
  await analyst.getByLabel("What you checked").fill("Reproduced with the researcher's request against the public API.");
  await analyst.getByLabel("Suggested severity").selectOption("high");
  await analyst.getByRole("button", { name: "Save validation" }).click();
  await expect(analyst.getByText("Reproduced with the researcher's request against the public API.")).toBeVisible();
  await analyst.getByText("Ask the organization").click();
  await analyst.getByLabel("Question").fill("Is this API reachable from the internet in production?");
  await analyst.getByRole("button", { name: "Escalate to the organization" }).click();
  await expect(analyst.getByText("Waiting for the organization")).toBeVisible();
  // Money and the organization's integrations are not the analyst's.
  await expect(analyst.getByRole("button", { name: /finalize/i })).toHaveCount(0);

  // The owner sees the question on the Managed Triage page and answers it.
  await org.goto(`/organizations/${ORG}/managed-triage`);
  await expect(org.getByText("Is this API reachable from the internet in production?")).toBeVisible();
  await org.getByLabel("Your answer").fill("Yes, it is public.");
  await org.getByRole("button", { name: "Send answer" }).click();
  await expect(org.getByText("Yes, it is public.")).toBeVisible();

  await analyst.reload();
  await expect(analyst.getByText("Yes, it is public.")).toBeVisible();

  // Every analyst action is in the organization's audit trail.
  const actions = await owner((db) => db.query<{ action: string }>("select action from public.audit_logs where entity_id = $1 and action like 'report.%' order by created_at", [report.id]).then((r) => r.rows.map((x) => x.action)));
  expect(actions).toEqual(expect.arrayContaining(["report.triage_claimed", "report.triage_validated", "report.triage_escalated", "report.escalation_answered"]));
});

test("Analytics: filter, download CSV/Excel/PDF, and a scheduled export arrives from the worker", async ({ browser }) => {
  test.setTimeout(240_000);
  const org = await signedIn(browser, OWNER);
  await org.goto(`/organizations/${ORG}/analytics`);
  await org.getByRole("link", { name: "Explore & export" }).click();
  await expect(org.getByText(/reports? match/)).toBeVisible();

  // Filter by status through the real form; the chip shows and the URL carries it.
  await org.locator("summary").filter({ hasText: /^Status/ }).click();
  await org.getByRole("checkbox", { name: "New" }).check();
  await org.getByRole("button", { name: "Apply" }).click();
  await expect(org).toHaveURL(/status=new/);
  await expect(org.getByRole("list", { name: "Active filters" })).toContainText("Status: New");

  for (const [label, type, magic] of [["CSV", "text/csv", "﻿\"Report id\""], ["Excel", "spreadsheetml", "PK"], ["PDF report", "application/pdf", "%PDF-1.4"]] as const) {
    const href = await org.getByRole("link", { name: label, exact: true }).getAttribute("href");
    const res = await org.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain(type);
    expect((await res.body()).toString("utf-8").startsWith(magic)).toBe(true);
  }

  // Schedule it, make it due, and let the real worker build and store the file.
  await org.getByRole("link", { name: "Schedule it" }).click();
  await org.getByLabel("Name").fill("E2E weekly report");
  await org.getByRole("button", { name: "Schedule" }).click();
  await expect(org.getByText("E2E weekly report").first()).toBeVisible();
  await owner((db) => db.query("update public.analytics_export_schedules set next_run_at = now() - interval '1 minute' where organization_id = $1 and name = 'E2E weekly report'", [ORG]));
  await expect(async () => {
    await org.reload();
    await expect(org.getByRole("link", { name: "Download" }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 150_000, intervals: [5000] });
  const file = await org.request.get((await org.getByRole("link", { name: "Download" }).first().getAttribute("href"))!);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");

  // Someone outside the organization gets nothing from the same link.
  const outsider = await signedIn(browser, "e2e.veteran@unpatched.demo");
  expect((await outsider.request.get((await org.getByRole("link", { name: "Download" }).first().getAttribute("href"))!)).status()).toBe(404);
});
