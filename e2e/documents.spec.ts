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
  for (const heading of ["GST tax invoices", "Credit and debit notes", "Monthly statements", "Wallet statement", "Bounty history report"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  // Monthly statement: opening, movements, closing.
  await page.getByRole("link", { name: /USD balance/ }).first().click();
  await expect(page.getByRole("heading", { name: "Monthly statement" })).toBeVisible();
  await expect(page.getByText("Closing balance").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();

  // Wallet statement and bounty history from their date forms.
  await page.goto(`${base}/documents`);
  const wallet = page.getByRole("heading", { name: "Wallet statement" }).locator("xpath=ancestor::section[1]");
  await wallet.getByLabel("From").fill("2026-01-01");
  await wallet.getByRole("button", { name: "Open statement" }).click();
  await expect(page.getByText("Opening balance").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();

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
  await expect(page.getByText(/section (194J|206AA)/)).toBeVisible();
  // Leave the account as it was, so other specs' payouts withhold nothing.
  await page.getByLabel("Tax residence").selectOption("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Nothing withheld for your tax residence")).toBeVisible();
});

test("keyboard-first shell: command menu and G-then-letter jumps", async ({ page }) => {
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${fixture.organizationId}`);
  await page.keyboard.press("Control+k");
  const search = page.getByRole("searchbox", { name: "Global search" });
  await expect(search).toBeFocused();
  await search.fill("billing doc");
  await page.getByRole("option", { name: /Billing documents/ }).click();
  await page.waitForURL(/\/payments\/documents$/);

  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("g");
  await page.keyboard.press("f");
  await page.waitForURL(/\/findings$/);
  // The new page wires its shortcuts once it hydrates; retry the key until the sheet opens.
  await expect(async () => {
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible({ timeout: 1000 });
  }).toPass();
});
