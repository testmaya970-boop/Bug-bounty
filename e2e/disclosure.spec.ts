import { test, expect, type Page } from "./qa-test";

// Disclosure lifecycle (db/migrations/202610060012) through the real UI: the researcher
// proposes a write-up, the program manager redacts and approves it (scheduled by the
// program's coordinated-disclosure policy, so not yet public), then unpublishes it.
// seed:e2e clears this report's disclosure every run.

const PASSWORD = "E2ESeed!2026";
const REPORT_TITLE = "E2E seed: resolved report with finalized bounty";
const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function openReport(page: Page) {
  const { organizationId, publicProgramId } = await fixture();
  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}/reports?status=resolved`);
  await page.getByRole("link", { name: REPORT_TITLE }).first().click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
}

test.describe.serial("report disclosure", () => {
  test("the researcher proposes a public write-up", async ({ page }) => {
    await signIn(page, "e2e.veteran@unpatched.demo");
    await page.goto("/reports");
    await page.getByRole("link", { name: REPORT_TITLE }).first().click();
    await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
    await page.getByLabel("Public title").fill("Auth bypass in the public API");
    await page.getByLabel("Public write-up").fill("A missing check let any token read other tenants. Internal host api-int-3 was used to confirm.");
    await page.getByRole("button", { name: "Request disclosure" }).click();
    await expect(page.getByText(/Pending review/)).toBeVisible();
  });

  test("the program manager redacts, approves (scheduled by policy), then unpublishes", async ({ page }) => {
    await signIn(page, "e2e.program-manager@unpatched.demo");
    await openReport(page);
    await expect(page.getByText("Public disclosure requested")).toBeVisible();
    await page.getByLabel("Public write-up").fill("A missing check let any token read other tenants.");
    await page.getByRole("button", { name: "Save redactions" }).click();
    await expect(page.getByLabel("Public write-up")).toHaveValue("A missing check let any token read other tenants.");
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/Goes public/)).toBeVisible(); // coordinated policy: after the waiting period

    await page.getByRole("button", { name: "Unpublish" }).click();
    await page.getByLabel(/Why is this being taken down/).fill("Customer asked for more time to patch older versions.");
    await page.getByRole("button", { name: "Confirm unpublish" }).click();
    await expect(page.getByText("Unpublished")).toBeVisible();
  });

  test("an unpublished report is not on the public feed", async ({ page }) => {
    await page.goto("/disclosures");
    await expect(page.getByText("Auth bypass in the public API")).toHaveCount(0);
  });
});
