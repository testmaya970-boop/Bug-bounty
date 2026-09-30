import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// The five organization roles, end to end (db/migrations/202609250012). seed:e2e puts a
// Program Manager, a Triager, and a Billing Admin in E2E Journey Org; the manager and
// triager are assigned to E2E Public Program only. Each test proves what the role CAN do
// and what it CANNOT -- including by direct URL, since hidden buttons prove nothing.
// Read-only against shared seed data (other spec files run in parallel), except one
// assign-then-unassign on the private program, which no other spec depends on.

const PASSWORD = "E2ESeed!2026";
const PUBLIC_PROGRAM = "E2E Public Program";
const PRIVATE_PROGRAM = "E2E Private Program";
const TRIAGE_REPORT = "E2E seed: fresh report for the live triage walk";
const PAID_REPORT = "E2E seed: resolved report with finalized bounty";
const DENIED = /do not have access|Only (an|this|a) |not allowed|Permission denied/i;

const fixture = () =>
  JSON.parse(readFileSync(path.join(process.cwd(), "e2e", ".seed-fixture.json"), "utf-8")) as { organizationId: string; publicProgramId: string; privateProgramId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Primary navigation" });

test("owner assigns a program team: the panel lists assignable people and assign/remove work", async ({ page }) => {
  const { organizationId, publicProgramId, privateProgramId } = fixture();
  await signIn(page, "e2e.admin@unpatched.demo");

  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
  const team = page.getByRole("region", { name: "Program team" });
  await expect(team.getByText("E2E Program Manager", { exact: true })).toBeVisible();
  await expect(team.getByText("E2E Triager", { exact: true })).toBeVisible();

  await page.goto(`/organizations/${organizationId}/programs/${privateProgramId}`);
  const privateTeam = page.getByRole("region", { name: "Program team" });
  await expect(privateTeam.getByText("No one is assigned yet.")).toBeVisible();
  await privateTeam.getByLabel("Assign a team member").selectOption({ label: "E2E Triager (Triager)" });
  await privateTeam.getByRole("button", { name: "Assign" }).click();
  await expect(privateTeam.getByText("Reads and triages this program's reports")).toBeVisible();
  await privateTeam.getByRole("button", { name: /Remove.*E2E Triager/ }).click();
  await expect(privateTeam.getByText("No one is assigned yet.")).toBeVisible();
});

test("triager: works assigned-program reports, cannot manage the program or see other programs", async ({ page }) => {
  const { organizationId, publicProgramId, privateProgramId } = fixture();
  await signIn(page, "e2e.triager@unpatched.demo");
  await page.goto(`/organizations/${organizationId}`);

  await expect(sidebar(page).getByRole("link", { name: "Engagements" })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Members" })).toHaveCount(0);
  await expect(sidebar(page).getByRole("link", { name: "Payments" })).toHaveCount(0);

  await page.goto(`/organizations/${organizationId}/programs`);
  await expect(page.getByText(PUBLIC_PROGRAM).first()).toBeVisible();
  await expect(page.getByText(PRIVATE_PROGRAM)).toHaveCount(0);

  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
  const tabs = page.getByRole("navigation", { name: "Program sections" });
  await expect(tabs.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Researchers" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add scope" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Program team" })).toHaveCount(0);

  await tabs.getByRole("link", { name: "Inbox" }).click();
  // The list row opens the side pane (?reportId=) -- or, depending on the viewport, may land
  // on the full report directly; reach the full report either way.
  await page.getByRole("link", { name: new RegExp(TRIAGE_REPORT) }).first().click();
  await page.waitForURL(/reportId=|\/reports\/[0-9a-f-]{36}$/);
  if (!/\/reports\/[0-9a-f-]{36}$/.test(new URL(page.url()).pathname)) {
    await page.getByRole("link", { name: /View full report/ }).click();
  }
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  // Calculating a recommendation is triage work (calculate_bounty_recommendation takes the
  // triage lock); deciding the amount is not.
  await expect(page.getByRole("button", { name: /Finalize bounty/ })).toHaveCount(0);

  await page.goto(`/organizations/${organizationId}/programs/${privateProgramId}`);
  await expect(page.getByText(DENIED).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: PRIVATE_PROGRAM })).toHaveCount(0);
});

test("program manager: runs the assigned program, no other programs, no payments or members", async ({ page }) => {
  const { organizationId, publicProgramId, privateProgramId } = fixture();
  await signIn(page, "e2e.program-manager@unpatched.demo");

  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
  await expect(page.getByRole("button", { name: "Add scope" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name: "Researchers" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Program team" })).toHaveCount(0); // assigning is admin-only

  for (const denied of [`/organizations/${organizationId}/programs/${privateProgramId}`, `/organizations/${organizationId}/payments`, `/organizations/${organizationId}/members`]) {
    await page.goto(denied);
    await expect(page.getByText(DENIED).first(), denied).toBeVisible();
  }
});

test("billing admin: sees the payment ledger with titles only, and no report contents anywhere", async ({ page }) => {
  const { organizationId, publicProgramId } = fixture();
  await signIn(page, "e2e.billing-admin@unpatched.demo");
  await page.goto(`/organizations/${organizationId}`);

  await expect(sidebar(page).getByRole("link", { name: "Payments" })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Engagements" })).toHaveCount(0);

  await sidebar(page).getByRole("link", { name: "Payments" }).click();
  const row = page.getByRole("row").filter({ hasText: PAID_REPORT });
  await expect(row).toBeVisible();
  await expect(row.getByText("E2E Veteran Researcher")).toBeVisible();
  await expect(row.getByText("USD 1800.00")).toBeVisible(); // $1,500 bounty + $300 fee billed to the org
  await expect(row.getByRole("link")).toHaveCount(0); // no way into the report from here

  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}/inbox`);
  await expect(page.getByText(DENIED).first()).toBeVisible();
  await page.goto(`/organizations/${organizationId}/findings`);
  await expect(page.getByText(TRIAGE_REPORT)).toHaveCount(0);
  await expect(page.getByText(PAID_REPORT)).toHaveCount(0);
});

test("an organization account's settings are organization-side only: no researcher settings, not even by URL", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto("/settings/profile");
  const nav = page.getByRole("navigation", { name: "Settings" });
  for (const item of ["Profile", "Email & Password", "Account Security", "Account Recovery", "Notifications", "Feedback", "Deactivate Account"]) {
    await expect(nav.getByRole("link", { name: item, exact: true })).toBeVisible();
  }
  for (const item of ["Skills & Interests", "Rewards & Payments", "Swag", "Reputation", "Report Templates", "API Token", "External Services", "Invitations"]) {
    await expect(nav.getByRole("link", { name: item, exact: true })).toHaveCount(0);
  }

  // Profile is who you are to your team, not a researcher's public profile.
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByLabel("Biography")).toHaveCount(0);
  await expect(page.getByLabel("Public username")).toHaveCount(0);

  // A researcher-only page by direct URL lands back on the account's own settings.
  await page.goto("/settings/skills");
  await expect(page).toHaveURL(/\/settings\/profile$/);

  // Notifications list what actually reaches the organization side.
  await page.goto("/settings/notifications");
  await expect(page.getByText("New reports and researcher messages on the programs you work on.")).toBeVisible();
  await expect(page.getByText("Platform decisions")).toBeVisible();
  await expect(page.getByText("Bounty finalized")).toHaveCount(0);

  await page.goto("/settings/deactivate");
  await expect(page.getByText("Your organization keeps an owner")).toBeVisible();
});
