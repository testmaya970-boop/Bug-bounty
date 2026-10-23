import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// The prepaid balance (db/migrations/202610140004) through the real UI: the organization
// reports a deposit, a platform admin confirms it; the organization pays an award from its
// balance and Unpatched (the platform admin, for a manual payout) sends it and records it.
// seed:e2e funds the organization and recreates the pending award every run.

const PASSWORD = "E2ESeed!2026";
const AWARD = "E2E seed: resolved report with finalized bounty";
const reference = `E2EUPI${Date.now()}`;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

test.describe.serial("prepaid balance", () => {
  test("billing admin reports a UPI deposit; it waits for confirmation", async ({ page }) => {
    const { organizationId } = await fixture();
    await signIn(page, "e2e.billing-admin@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/payments`);
    await page.getByRole("button", { name: "Add funds" }).click();
    const dialog = page.getByRole("dialog", { name: "Add funds" });
    await expect(dialog.getByText(/^UNP-[0-9A-F]{8}$/)).toBeVisible(); // the code for the transfer remarks
    await dialog.getByLabel("Amount (INR)").fill("25000");
    await dialog.getByLabel("Sent by").selectOption("upi");
    await dialog.getByLabel("Transfer reference").fill(reference);
    await dialog.getByRole("button", { name: "Report transfer" }).click();
    await expect(dialog.getByText(/We.ll match your transfer/)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    const row = page.getByRole("listitem").filter({ hasText: reference });
    await expect(row.getByText("Pending")).toBeVisible();
    // The total includes any other pending INR deposits, so only the note itself is checked.
    await expect(page.getByText(/INR [0-9.]+.*waiting for confirmation/)).toBeVisible();
  });

  test("billing admin pays the award; the organization never records the transfer itself", async ({ page }) => {
    const { organizationId } = await fixture();
    await signIn(page, "e2e.billing-admin@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/payments`);
    const row = page.getByRole("row").filter({ hasText: AWARD });
    await expect(row.getByText("Pending")).toBeVisible();
    await row.getByRole("button", { name: "Pay researcher" }).click();
    const confirm = page.getByRole("dialog", { name: "Pay this researcher?" });
    await expect(confirm.getByText("USD 1500.00")).toBeVisible(); // the bounty; the fee now comes out of it (202610230001)
    await confirm.getByRole("button", { name: "Pay researcher" }).click();
    await expect(row.getByText("Unpatched is sending this")).toBeVisible();
    await expect(row.getByRole("button", { name: "Record payout result" })).toHaveCount(0);
  });

  test("platform admin confirms the deposit and sends the payout", async ({ page }) => {
    await signIn(page, "e2e.platform-admin@unpatched.demo");
    await page.goto("/platform/payouts");

    const deposit = page.getByRole("listitem").filter({ hasText: reference });
    await deposit.getByRole("button", { name: "Confirm received" }).click();
    await expect(deposit).toHaveCount(0);

    // The admin sends the net: USD 1500 bounty less the 20% platform fee (US W-9 on file, no tax withheld).
    const payout = page.getByRole("listitem").filter({ hasText: "E2E Veteran Researcher" }).filter({ hasText: "USD 1200.00" });
    await expect(payout.getByText("PayPal · e2e.veteran.payouts@example.test")).toBeVisible(); // who to pay, shown to the payer only
    await payout.getByRole("button", { name: "Record payout result" }).click();
    const record = page.getByRole("dialog", { name: "Record the outcome of this payout attempt" });
    await record.getByLabel("Outcome").selectOption("succeeded");
    await record.getByLabel("Transfer reference").fill(`PAYPAL-${reference}`);
    await record.getByRole("button", { name: "Continue" }).click();
    await record.getByRole("button", { name: "Confirm" }).click();
    await expect(payout).toHaveCount(0);
  });

  test("billing admin sees the deposit confirmed and the award paid", async ({ page }) => {
    const { organizationId } = await fixture();
    await signIn(page, "e2e.billing-admin@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/payments`);
    await expect(page.getByRole("listitem").filter({ hasText: reference }).getByText("Confirmed")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: AWARD }).getByText("Paid")).toBeVisible();
  });
});
