import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// The three analytics dashboards (db/migrations/202610130003): each renders its KPI row and
// charts from real data, the time filter re-reads everything, and every chart has a table.
// Accounts chosen to stay under the 10-per-15-minute sign-in limit per run.

const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

async function expectTiles(page: Page, labels: string[]) {
  for (const label of labels) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
}

test("researcher dashboard: KPIs, distinct status colors, range filter and table view", async ({ page }) => {
  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Your performance" })).toBeVisible();
  await expectTiles(page, ["Reports submitted", "Validity rate", "Bounties awarded", "Reputation", "Median first response"]);

  // Accepted and Resolved used to share one green; each status now has its own color.
  const statusCard = page.locator("figure", { has: page.getByRole("heading", { name: "Status of all your reports" }) });
  const swatches = await statusCard.locator("dl span[aria-hidden='true']").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  expect(new Set(swatches).size).toBe(swatches.length);

  await page.getByRole("link", { name: "12 months" }).click();
  await expect(page).toHaveURL(/range=365/);
  await expect(page.getByText("Reports you submitted in the last 12 months")).toBeVisible();

  const card = page.locator("figure", { has: page.getByRole("heading", { name: "Reputation over time" }) });
  await card.getByText("View as table").click();
  await expect(card.getByRole("table")).toBeVisible();
});

test("organization dashboard: KPIs and charts for owners", async ({ page }) => {
  await signIn(page, "e2e.launch-admin@unpatched.demo");
  await page.goto("/organizations");
  await page.getByRole("link", { name: /E2E Launch Org/ }).first().click();
  await page.waitForURL(/\/organizations\/[0-9a-f-]{36}$/);
  await page.goto(`${new URL(page.url()).pathname}/analytics`);
  await expect(page.getByRole("heading", { name: "Security overview" })).toBeVisible();
  await expectTiles(page, ["Reports received", "Validity rate", "Open backlog", "Median time to triage", "Median time to close", "Bounties awarded"]);
  await expect(page.getByRole("heading", { name: "Report inflow by severity" })).toBeVisible();
  // The weekly chart is keyboard-readable: arrowing shows a tooltip for a week.
  const plot = page.getByRole("img", { name: /Weekly report inflow by severity/ });
  await plot.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plot.locator("dl")).toBeVisible();
});

test("platform overview: admins land on it, with queues and platform health", async ({ page }) => {
  await signIn(page, "e2e.platform-admin@unpatched.demo");
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("heading", { name: "Monitors" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Launch reviews/ })).toHaveAttribute("href", "/platform/programs");
  await expectTiles(page, ["Reports submitted", "Validity rate", "Bounties paid", "New researchers", "New organization accounts", "Live programs"]);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).first().getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
});
