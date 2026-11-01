import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import { passMfaGate } from "./mfa-gate";

// Anti-abuse (db/migrations/202610210001_submission_signal.sql) through the real UI: a
// researcher sees their daily allowance on the report form; a platform admin pauses their
// submissions, the researcher sees the reason instead, and the admin resumes them. The
// database rules themselves (caps, near-duplicates, the automatic cooldown) are exercised
// directly against the database in the migration's verification run.

const PASSWORD = "E2ESeed!2026";
const FLAGGED = "e2e.flagged@unpatched.demo";
const ADMIN = "e2e.platform-admin@unpatched.demo";
const REASON = "E2E: several reports were copied from public write-ups.";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
}

test.describe.serial("submission signal", () => {
  const { organizationId, publicProgramId } = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };
  const reportForm = `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`;

  test("researcher sees their daily allowance", async ({ page }) => {
    await signIn(page, FLAGGED);
    await page.goto(reportForm);
    const standing = page.getByRole("region", { name: "Submission standing" });
    await expect(standing).toContainText(/of 5 reports left today/);
    await expect(standing).toContainText("New researcher");
  });

  test("admin pauses, researcher sees why, admin resumes", async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto("/platform/researchers");
    const form = page.getByRole("form", { name: "Pause report submissions" });
    await form.getByRole("combobox", { name: "Researcher" }).fill("e2e.flagged");
    await form.getByRole("option").filter({ hasText: FLAGGED }).click();
    await form.getByLabel("Days").fill("3");
    await form.getByLabel("Reason shown to the researcher").fill(REASON);
    await form.getByRole("button", { name: "Pause submissions" }).click();
    const row = page.getByRole("listitem").filter({ hasText: FLAGGED }).filter({ hasText: "Paused by an admin" });
    await expect(row).toContainText(REASON);

    await signIn(page, FLAGGED);
    await page.goto(reportForm);
    await expect(page.getByRole("alert").filter({ hasText: "Your report submissions are paused" })).toContainText(REASON);

    await signIn(page, ADMIN);
    await page.goto("/platform/researchers");
    await page.getByRole("button", { name: "Resume submissions for E2E Flagged Researcher" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: FLAGGED }).filter({ hasText: "Paused by an admin" })).toHaveCount(0);

    await signIn(page, FLAGGED);
    await page.goto(reportForm);
    await expect(page.getByRole("region", { name: "Submission standing" })).toContainText(/reports left today/);
  });
});
