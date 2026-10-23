import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// Full launch journey across three real sessions: org admin drafts a public bug bounty
// engagement and submits it for review -> platform admin approves it at /platform/programs
// (activate_program is platform-admin-only) -> a first-time researcher finds it in public
// discovery, joins, and submits a report -> the org admin sees it land in the program Inbox.
// Seed first: `npm run seed:e2e` (creates e2e.platform-admin + e2e.hunter).

const PASSWORD = "E2ESeed!2026";
// Its own org (seed-e2e.ts E2E_LAUNCH_ORG_NAME): each run adds a program + report.
const ADMIN_EMAIL = "e2e.launch-admin@unpatched.demo";
const PLATFORM_ADMIN_EMAIL = "e2e.platform-admin@unpatched.demo";
const RESEARCHER_EMAIL = "e2e.hunter@unpatched.demo";
const ORG_NAME = "E2E Launch Org";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");
}

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/launch-journey/${name}.png`, fullPage: true });

test("launch journey: org creates + submits engagement, platform admin activates, researcher submits a report, platform admin suspends + reinstates", async ({ page }) => {
  test.setTimeout(360_000); // 11 sign-in legs across four roles
  const stamp = Date.now();
  const programName = `Acme Payments Bug Bounty ${stamp}`;
  const scopeTarget = `api.acme-payments-${stamp}.example`;
  const reportTitle = `IDOR on ${scopeTarget} exposes other customers' invoices`;

  // --- 1. Org admin: create engagement, make public, add scope, submit for review --------
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/organizations");
  await page.getByRole("link", { name: new RegExp(ORG_NAME) }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Engagements" }).click();
  await page.waitForURL(/\/programs$/);

  // .first(): with zero programs the page shows both a header and an empty-state trigger.
  await page.getByRole("button", { name: /Create (another )?engagement/ }).first().click();
  await page.getByLabel("Engagement name").fill(programName);
  await page.getByRole("dialog").getByRole("button", { name: "Create engagement" }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  const programPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: programName })).toBeVisible();

  // Visibility lives in the program's Settings tab (Oct 23).
  await page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("switch", { name: /^Private:/ }).click();
  await expect(page.getByText(/Public: researchers can discover this program/)).toBeVisible();
  await page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name: "Overview" }).click();

  await page.getByRole("button", { name: "Add scope" }).click();
  await page.getByRole("textbox", { name: "Target" }).fill(scopeTarget);
  await page.getByRole("button", { name: "Add scope entry" }).click();
  await expect(page.getByText(scopeTarget).first()).toBeVisible();
  await expect(page.getByRole("presentation")).not.toBeVisible();
  await shot(page, "1-org-draft-with-scope");

  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Awaiting platform review/)).toBeVisible();
  await shot(page, "2-org-submitted-for-review");
  await signOut(page);

  // --- 2. Platform admin: approve the launch -> program goes active ----------------------
  await signIn(page, PLATFORM_ADMIN_EMAIL);
  await page.goto("/platform/programs");
  const queueItem = page.getByRole("listitem").filter({ hasText: programName });
  await expect(queueItem).toBeVisible();
  await expect(queueItem.getByText("1 scope entry")).toBeVisible();
  await shot(page, "3-platform-review-queue");
  await queueItem.getByRole("button", { name: "Approve" }).click();
  // The approve action revalidates the queue, so the row (and its "Approved" note) drops out.
  await expect(queueItem).toHaveCount(0);
  await signOut(page);

  // --- 3. Researcher: discover, join, submit a vulnerability report ----------------------
  await signIn(page, RESEARCHER_EMAIL);
  await page.goto(`/programs?tab=all&q=${encodeURIComponent(programName)}`);
  await page.getByRole("link", { name: new RegExp(programName) }).first().click();
  await page.waitForURL((url) => url.pathname === programPath);
  await shot(page, "4-researcher-program-page");
  await page.getByRole("button", { name: /Start researching/ }).click();
  await page.waitForURL(/\/reports\/new$/);

  await page.getByLabel("Target type").selectOption("domain");
  // The in-scope <datalist> makes this input a combobox, not a textbox.
  await page.getByRole("combobox", { name: "Target", exact: true }).fill(scopeTarget);
  await page.getByLabel("Title").fill(reportTitle);
  await page.getByLabel("Weakness type").selectOption("idor");
  await page.getByLabel("Your severity assessment").selectOption("high");
  // Unique per run: the same text to several programs in a day trips NEAR_DUPLICATE_BLAST.
  const invoice = 10000 + Math.floor(Math.random() * 89999);
  await page.getByLabel("Description").fill(
    [
      `Found on ${programName} (run ${stamp}).`,
      // Enough run-specific text that repeated runs never read as the same report (similarity < 0.85).
      `Environment ${stamp}: ${Array.from({ length: 24 }, () => Math.random().toString(36).slice(2, 8)).join(" ")}.`,
      `1. Sign in as customer A (${stamp}-a) and open Billing -> Invoices.`,
      `2. Capture \`GET /v1/invoices/${invoice}\` in a proxy.`,
      `3. Replay it with customer A's token but invoice id ${invoice + 1}, owned by customer ${stamp}-b.`,
      `4. The API returns ${stamp}-b's full invoice (name, address, line items, last-4 of card).`,
    ].join("\n"),
  );
  await page.getByLabel("Impact").fill("Any authenticated customer can enumerate sequential invoice ids and read every other customer's billing PII.");
  await shot(page, "5-researcher-report-form");
  await page.getByRole("button", { name: "Submit report" }).click();

  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: reportTitle })).toBeVisible();
  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
  await shot(page, "6-researcher-report-submitted");
  await signOut(page);

  // --- 4. Org admin: the report lands in the program's Inbox -----------------------------
  await signIn(page, ADMIN_EMAIL);
  await page.goto(programPath);
  await page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("link", { name: reportTitle })).toBeVisible();
  await shot(page, "7-org-inbox-shows-report");
  await signOut(page);

  // --- 5. Platform admin: platform-wide counts, search, suspend -------------------------
  await signIn(page, PLATFORM_ADMIN_EMAIL);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "All programs" }).click();
  await page.waitForURL(/\/platform\/all-programs$/);
  const statusFilters = page.getByRole("navigation", { name: "Filter by status" });
  await expect(statusFilters.getByRole("link", { name: /Active/ })).toBeVisible();
  await expect(statusFilters.getByRole("link", { name: /Closed/ })).toBeVisible();
  await page.getByLabel("Search programs").fill(programName);
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=/);
  const row = page.getByRole("row").filter({ hasText: programName });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await expect(row.getByText("1", { exact: true })).toBeVisible(); // the one report submitted above
  await shot(page, "8-platform-all-programs-search");

  await row.getByRole("button", { name: /^Suspend/ }).click();
  const suspendDialog = page.getByRole("dialog", { name: `Suspend ${programName}?` });
  await suspendDialog.getByRole("button", { name: "Suspend program" }).click();
  await expect(suspendDialog.getByText("Explain the reason.")).toBeVisible(); // reason is required
  await suspendDialog.getByLabel("Reason for suspension").fill("Payout dispute under investigation; pausing intake pending review.");
  await suspendDialog.getByRole("button", { name: "Suspend program" }).click();
  await expect(suspendDialog).not.toBeVisible();
  await expect(row.getByText("Suspended", { exact: true })).toBeVisible();
  await shot(page, "9-platform-program-suspended");
  await signOut(page);

  // --- 6. Researcher: gone from discovery, no way to report -----------------------------
  await signIn(page, RESEARCHER_EMAIL);
  await page.goto(`/programs?tab=all&q=${encodeURIComponent(programName)}`);
  await expect(page.getByText("No matching public programs")).toBeVisible();
  await page.goto(programPath);
  await expect(page.getByRole("link", { name: "Report a vulnerability" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start researching/ })).toHaveCount(0);
  await shot(page, "10-researcher-suspended-program");
  await signOut(page);

  // --- 7. Org admin: sees the suspension, has no lifecycle controls to undo it ----------
  await signIn(page, ADMIN_EMAIL);
  await page.goto(programPath);
  await expect(page.getByText(/Suspended by the platform/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Resume program|Pause program|Close program/ })).toHaveCount(0);
  await shot(page, "11-org-sees-suspension");
  // ...and was told: audit_logs trigger -> outbox -> worker -> notification (202609250007).
  await page.goto("/notifications");
  const notice = page.getByRole("listitem").filter({ hasText: "A program was suspended by the platform" }).filter({ hasText: programName });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: /Open program/ })).toHaveAttribute("href", programPath);
  await shot(page, "11b-org-notified-of-suspension");
  await signOut(page);

  // --- 8. Platform admin: reinstate -> back to Active ------------------------------------
  await signIn(page, PLATFORM_ADMIN_EMAIL);
  await page.goto(`/platform/all-programs?q=${encodeURIComponent(programName)}&status=suspended`);
  await row.getByRole("button", { name: /^Reinstate/ }).click();
  const reinstateDialog = page.getByRole("dialog", { name: `Reinstate ${programName}?` });
  await reinstateDialog.getByLabel("Reason for reinstatement").fill("Dispute resolved.");
  await reinstateDialog.getByRole("button", { name: "Reinstate program" }).click();
  await expect(reinstateDialog).not.toBeVisible();
  // Filtered to suspended, so the reinstated row drops out of this view.
  await expect(row).toHaveCount(0);
  await page.goto(`/platform/all-programs?q=${encodeURIComponent(programName)}`);
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await signOut(page);
});
