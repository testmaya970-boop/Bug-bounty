import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import { passMfaGate } from "./mfa-gate";

// 202610280003 through the real UI, in test mode (the sandbox stands in for each gateway's own
// page): an organization picks PayPal, pays, and comes back to Unpatched; a researcher connects a
// PayPal account and disconnects it; identity and tax details live under Identity & Tax.

const PASSWORD = "E2ESeed!2026";
const fixture = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

test("add funds with PayPal: choose the gateway, pay on its page, return to Unpatched", async ({ page }) => {
  await signIn(page, "e2e.billing-admin@unpatched.demo");
  await page.goto(`/organizations/${fixture.organizationId}/payments/add-funds`);
  for (const name of [/Stripe/, /PayPal/, /Razorpay/]) await expect(page.getByRole("radio", { name })).toBeVisible();
  await expect(async () => {
    await page.getByRole("radio", { name: /PayPal/ }).click();
    await expect(page.getByRole("radio", { name: /PayPal/ })).toHaveAttribute("aria-checked", "true", { timeout: 2000 });
  }).toPass();
  await page.getByLabel("Amount (USD)").fill("40");
  await page.getByRole("button", { name: "Continue to PayPal" }).click();

  await page.waitForURL(/\/payments\/card-sandbox\?ref=card_/);
  await expect(page.getByText("PayPal checkout")).toBeVisible();
  await page.getByRole("radio", { name: /^PayPal/ }).click();
  await page.getByRole("button", { name: "Pay", exact: true }).click();

  await page.waitForURL(/\/payments\/add-funds\/return\?ref=card_/);
  await expect(page.getByText("USD 40.00 added to your balance.")).toBeVisible();
  await expect(page.getByText("PayPal confirmed the payment.")).toBeVisible();
  await page.screenshot({ path: "test-results/payment-modules/return.png", fullPage: true });

  // The status comes from the database, not the URL: a made-up reference shows nothing.
  const bogus = await page.goto(`/organizations/${fixture.organizationId}/payments/add-funds/return?ref=card_${"0".repeat(32)}`);
  expect(bogus?.status()).toBe(404);
});

test("a researcher connects a PayPal payout account and finds identity and tax under Identity & Tax", async ({ page }) => {
  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto("/settings/payments");
  await expect(page.getByRole("heading", { name: "Payout details" }).or(page.getByText("Payout method")).first()).toBeVisible(); // manual details stay
  await expect(page.getByText("Manual identity review")).toHaveCount(0); // moved to Identity & Tax

  const card = page.getByRole("listitem").filter({ hasText: "PayPal" }).first();
  if (await card.getByRole("button", { name: "Disconnect" }).count()) {
    await card.getByRole("button", { name: "Disconnect" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(card.getByRole("button", { name: "Connect PayPal" })).toBeVisible();
  }
  await card.getByRole("button", { name: "Connect PayPal" }).click();
  await page.waitForURL(/\/settings\/payments\/connect-sandbox\?provider=paypal&state=/);
  await page.getByLabel("PayPal account email").fill("veteran.payouts@example.com");
  await page.getByRole("button", { name: "Allow" }).click();

  await page.waitForURL(/\/settings\/payments\?connected=paypal/);
  await expect(page.getByText("PayPal account connected.")).toBeVisible();
  await expect(page.getByText("Connected: veteran.payouts@example.com")).toBeVisible();
  await page.screenshot({ path: "test-results/payment-modules/connected.png", fullPage: true });

  // A replayed or forged callback can't connect anything.
  await page.goto("/api/payout-connect/paypal/callback?state=forged&outcome=allow&account=attacker@example.com");
  await expect(page.getByText("The account wasn't connected.")).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "PayPal" }).first().getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("button", { name: "Connect PayPal" })).toBeVisible();

  await page.goto("/settings/identity");
  await expect(page.getByRole("heading", { name: "Identity & Tax" })).toBeVisible();
  await expect(page.getByText("Manual identity review")).toBeVisible();
  await expect(page.getByLabel("Form type")).toBeVisible();
});
