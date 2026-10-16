import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// Card top-ups, low-balance alerts, program budgets, billing details and fee invoices
// (db/migrations/202610150002) through the real UI. The prod-build server runs the card
// sandbox (playwright.config.ts), which stands in for Razorpay / Stripe's hosted page.

const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

test.describe.serial("payment features", () => {
  test("billing admin: card top-up, alert, budget and billing details", async ({ page }) => {
    const { organizationId } = await fixture();
    const payments = `/organizations/${organizationId}/payments`;
    await signIn(page, "e2e.billing-admin@unpatched.demo");
    await page.goto(payments);

    // Card: the surcharge is shown before paying; the sandbox checkout approves it.
    await page.getByRole("button", { name: "Add funds" }).click();
    const dialog = page.getByRole("dialog", { name: "Add funds" });
    await dialog.getByRole("radio", { name: "USD" }).click();
    await dialog.getByRole("radio", { name: "Card" }).click();
    await dialog.getByLabel("Amount to add (USD)").fill("100");
    await expect(dialog.getByText("USD 103.00")).toBeVisible();
    await dialog.getByRole("button", { name: "Pay by card" }).click();
    await page.waitForURL(/\/payments\/card-sandbox\?ref=card_/);
    await expect(page.getByText("USD 100.00")).toBeVisible();
    await page.getByRole("button", { name: "Approve payment" }).click();
    await page.waitForURL(/\/payments\?card=done/);
    await expect(page.getByRole("listitem").filter({ hasText: "Card" }).filter({ hasText: "USD 100.00" }).getByText("Confirmed").first()).toBeVisible();

    // Low-balance alert above the balance fires at once; then turned off again.
    const usdAlert = page.getByLabel("Alert below (USD)");
    await usdAlert.fill("99999999");
    await usdAlert.locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Alert saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Your balance is below this now.")).toBeVisible();
    await page.getByLabel("Alert below (USD)").fill("");
    await page.getByLabel("Alert below (USD)").locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Alert turned off.")).toBeVisible();

    // Program budget: set, shown as used of cap, then removed so other specs aren't limited.
    const budgetRow = page.getByRole("list", { name: "Program budgets" }).getByRole("listitem").filter({ hasText: "E2E Public Program" });
    await budgetRow.getByRole("button", { name: "Set budget" }).click();
    await budgetRow.getByLabel("Currency").selectOption("USD");
    await budgetRow.getByLabel("Budget", { exact: true }).fill("90000000");
    await budgetRow.getByRole("button", { name: "Save" }).click();
    await expect(budgetRow.getByText("Budget saved.")).toBeVisible();
    await expect(budgetRow.getByText(/USD [0-9.]+ of 90000000\.00 awarded/)).toBeVisible();
    await budgetRow.getByLabel("Budget", { exact: true }).fill("");
    await budgetRow.getByRole("button", { name: "Save" }).click();
    await expect(budgetRow.getByText("No limit. Awards draw on the whole balance.")).toBeVisible();

    // Billing details: a GSTIN whose state doesn't match is refused; a matching one saves.
    await page.getByLabel("Legal name").fill("E2E Journey Org Pvt Ltd");
    await page.getByLabel("GSTIN").fill("27ABCDE1234F1Z5");
    await page.getByLabel("Address").fill("1 MG Road");
    await page.getByLabel("City").fill("Bengaluru");
    await page.getByLabel("Postal code").fill("560001");
    await page.getByLabel("Country").fill("IN");
    await page.getByLabel("State code").fill("29");
    await page.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /GSTIN/i })).toBeVisible();
    await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
    await page.getByRole("button", { name: "Save billing details" }).click();
    await expect(page.getByText("Billing details saved.")).toBeVisible();
  });

  test("platform admin issues last month's fee invoices", async ({ page }) => {
    await signIn(page, "e2e.platform-admin@unpatched.demo");
    await page.goto("/platform/payouts");
    await expect(page.getByText("Unpatched SANDBOX (not a tax invoice)")).toBeVisible();
    await page.getByRole("button", { name: "Issue invoices" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Issued \d+ invoices?\.|Nothing to invoice for that month\./ })).toBeVisible();
  });
});
