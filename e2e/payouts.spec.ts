import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// The payout lifecycle (db/migrations/202610060008) through the real UI: the researcher
// confirms the award, the organization sees who is owed and that nothing blocks paying
// them, and the platform admin has the tax-form queue that unblocks payouts. The payment
// itself (initiate -> record -> Paid) is functional-cases.spec.ts's billing-admin case.
// seed:e2e resets the confirmation and gives the veteran a payout method + verified tax form.

const PASSWORD = "E2ESeed!2026";
const REPORT_TITLE = "E2E seed: resolved report with finalized bounty";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

async function openSeededReport(page: Page) {
  const { organizationId, publicProgramId } = await fixture();
  // The full Reports list, not the program page's 5-report preview, which newer reports push it out of.
  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}/reports?status=resolved`);
  await page.getByRole("link", { name: REPORT_TITLE }).first().click();
  await page.waitForURL(/\/reports\/[0-9a-f-]+$/);
}

test.describe.serial("payout lifecycle", () => {
  // No award confirmation step (removed 2026-10-23): once Unpatched sends the money it is done.
  test("the researcher sees the award with nothing to confirm and nothing blocking payment", async ({ page }) => {
    await signIn(page, "e2e.veteran@unpatched.demo");
    await page.goto("/reports");
    await page.getByRole("link", { name: REPORT_TITLE }).first().click();
    await page.waitForURL(/\/reports\/[0-9a-f-]+$/);

    await expect(page.getByText("Before you can be paid:")).toHaveCount(0); // payout method + verified tax form are on file
    await expect(page.getByRole("button", { name: "Confirm award" })).toHaveCount(0);
  });

  test("the organization sees who is owed and nothing blocking payment", async ({ page }) => {
    await signIn(page, "e2e.admin@unpatched.demo");
    await openSeededReport(page);
    await expect(page.getByText("E2E Veteran Researcher").first()).toBeVisible();
    await expect(page.getByText("Can't be paid yet")).toHaveCount(0);
  });

  test("the platform admin has the tax-form review queue", async ({ page }) => {
    await signIn(page, "e2e.platform-admin@unpatched.demo");
    await page.goto("/platform/kyc");
    await expect(page.getByText("Tax forms", { exact: true })).toBeVisible();
    await expect(page.getByText("A researcher cannot be paid until their tax form is verified here.")).toBeVisible();
  });
});
