import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import { passMfaGate } from "./mfa-gate";

// Billing and earnings documents (db/migrations/202610220040) and the keyboard-first shell,
// through the real UI on a production build.

const PASSWORD = "E2ESeed!2026";
const fixture = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("billing admin opens every organization document; a triager is refused", async ({ page }) => {
  const base = `/organizations/${fixture.organizationId}/payments`;
  await signIn(page, "e2e.billing-admin@unpatched.demo");
  await page.goto(`${base}/documents`);
  for (const heading of ["GST tax invoices", "Credit and debit notes", "Budgets", "Wallet statement", "Bounty history report"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  // Budgets: searchable by program, filterable by how close each is to its cap.
  await page.getByRole("link", { name: "Search all budgets" }).click();
  await page.getByRole("main").getByRole("searchbox", { name: "Search programs" }).fill("E2E Public");
  await page.getByRole("main").getByRole("searchbox", { name: "Search programs" }).press("Enter");
  await page.waitForURL(/budgets\?q=E2E/);
  await expect(page.getByRole("list", { name: "Program budgets" }).getByText("E2E Public Program")).toBeVisible();
  await expect(page.getByRole("list", { name: "Program budgets" }).getByText("E2E Private Program")).toHaveCount(0);

  // Wallet statement and bounty history from their date forms.
  await page.goto(`${base}/documents`);
  const wallet = page.getByRole("heading", { name: "Wallet statement" }).locator("xpath=ancestor::section[1]");
  await wallet.getByLabel("From").fill("2026-01-01");
  await wallet.getByRole("button", { name: "Open statement" }).click();
  await expect(page.getByText("Opening balance").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  await page.goto(`${base}/documents`);
  const history = page.getByRole("heading", { name: "Bounty history report" }).locator("xpath=ancestor::section[1]");
  await history.getByLabel("From").fill("2026-01-01");
  await history.getByRole("button", { name: "Open report" }).click();
  await expect(page.getByRole("heading", { name: "Bounty history report" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Bounty" })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, "e2e.triager@unpatched.demo");
  await page.goto(`${base}/documents`);
  await expect(page.getByText(/Only an owner, security admin, or billing admin/)).toBeVisible();
});

test("researcher sets a tax residence and sees the rule for the next payout", async ({ page }) => {
  await signIn(page, "e2e.hunter@unpatched.demo");
  await page.goto("/bounties/documents");
  await expect(page.getByRole("heading", { name: "Tax profile" })).toBeVisible();
  await page.getByLabel("Tax residence").selectOption("IN");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tax residence saved" })).toBeVisible();
  await expect(page.getByText(/section 393/)).toBeVisible();
  // Leave the account as it was, so other specs' payouts withhold nothing.
  await page.getByLabel("Tax residence").selectOption("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Nothing withheld for your tax residence")).toBeVisible();
});

test("no keyboard shortcuts: the sidebar search field opens search, and shortcut keys do nothing", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  const home = `/organizations/${fixture.organizationId}`;
  await page.goto(home);
  await expect(page.getByText("Keyboard shortcuts")).toHaveCount(0);
  await expect(page.getByText("⌘K")).toHaveCount(0);

  // Former shortcuts are inert: no command menu, no G-then-letter jump, no shortcut sheet.
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  for (const key of ["Control+k", "g", "f", "?", "["]) await page.keyboard.press(key);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${home}$`));

  const search = page.getByRole("search", { name: "Search programs and reports" }).getByRole("searchbox");
  await search.fill("E2E");
  await search.press("Enter");
  await page.waitForURL(/\/search\?q=E2E/);
});

test("audit log: an owner filters to scope changes and searches what changed", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${fixture.organizationId}/activity`);
  await page.getByLabel("Category").selectOption("scope");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/category=scope/);
  const table = page.getByRole("table", { name: "Audit log" });
  await expect(table.getByText(/^scope\.asset_/).first()).toBeVisible();
  await expect(table.getByText(/^report\./)).toHaveCount(0);
  await page.getByRole("main").getByRole("searchbox", { name: /Search/ }).fill("out_of_scope");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(table.getByText(/Scope state: in scope → out of scope/).first()).toBeVisible();
});

test("onboarding: an owner sees what's left to set up, linked to where it's done", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${fixture.organizationId}`);
  // The seeded org has launched, so only open steps show; its admins have no two-factor yet.
  const setup = page.getByRole("region", { name: "Finish setup" });
  await expect(setup.getByRole("link", { name: "Turn on two-factor for every admin" })).toHaveAttribute("href", "/settings/security");
  await expect(setup.getByText("Create your first engagement")).toHaveCount(0);
});

test("private pilot: suggested researchers are invited by username and their email never shows", async ({ page }) => {
  const fx = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; privateProgramId: string };
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${fx.organizationId}/programs/${fx.privateProgramId}#researchers`);
  const suggested = page.getByRole("region", { name: "Suggested for your private pilot" });
  await suggested.getByRole("button", { name: "Invite @bugtest-researcher" }).click();
  // The page refreshes: the researcher leaves the suggestions and appears as a pending invitation.
  await expect(suggested.getByRole("button", { name: "Invite @bugtest-researcher" })).toHaveCount(0);
  const pending = page.getByRole("listitem").filter({ hasText: "@bugtest-researcher" }).filter({ has: page.getByRole("button", { name: "Cancel invitation" }) });
  await expect(pending).toBeVisible();
  await expect(page.getByText("e2e.veteran@unpatched.demo")).toHaveCount(0);
  // Leave the program as it was for other specs.
  await pending.getByRole("button", { name: "Cancel invitation" }).click();
  await expect(pending).toHaveCount(0);
});

test("identity first: a researcher without verified KYC can't open the report form", async ({ page }) => {
  const fx = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };
  await signIn(page, "e2e.unverified@unpatched.demo");
  await page.goto(`/organizations/${fx.organizationId}/programs/${fx.publicProgramId}/reports/new`);
  await expect(page.getByRole("heading", { name: "Verify your identity to submit reports" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Verify identity" })).toHaveAttribute("href", "/settings/identity");
  await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(0);
});
