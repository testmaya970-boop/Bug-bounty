import { test, expect, type Page } from "./qa-test";

// Report assignment (db/migrations/202610060011) through the real UI: a program manager assigns a
// report to a triager from the report page, the Reports list shows and filters by
// assignee, and the triager finds it under "Assigned to: Me". seed:e2e unassigns every run.

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

test.describe.serial("report assignment", () => {
  test("the program manager assigns a report to a triager and the queue reflects it", async ({ page }) => {
    const { organizationId, publicProgramId } = await fixture();
    const reportsPath = `/organizations/${organizationId}/programs/${publicProgramId}/reports`;
    // Not e2e.admin: that account is near the sign-in limit (10 per 15 min) in a full run.
    await signIn(page, "e2e.program-manager@unpatched.demo");
    await page.goto(`${reportsPath}?status=resolved`);
    await page.getByRole("link", { name: REPORT_TITLE }).first().click();
    await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);

    await page.getByLabel("Assignee").selectOption({ label: "E2E Triager" });
    await expect(page.getByLabel("Assignee")).toHaveValue(/[0-9a-f-]{36}/);
    await page.reload();
    await expect(page.getByLabel("Assignee").locator("option:checked")).toHaveText("E2E Triager");

    await page.goto(`${reportsPath}?status=resolved&assignee=unassigned`);
    await expect(page.getByRole("link", { name: REPORT_TITLE })).toHaveCount(0);
    await page.goto(`${reportsPath}?status=resolved`);
    const row = page.getByRole("row").filter({ hasText: REPORT_TITLE });
    await expect(row.getByText("E2E Triager")).toBeVisible();
  });

  test("the triager finds it under Assigned to: Me", async ({ page }) => {
    const { organizationId, publicProgramId } = await fixture();
    await signIn(page, "e2e.triager@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}/reports`);
    await page.getByLabel("Assigned to").selectOption("me");
    await page.waitForURL(/assignee=me/);
    await expect(page.getByRole("link", { name: REPORT_TITLE }).first()).toBeVisible();
  });
});
