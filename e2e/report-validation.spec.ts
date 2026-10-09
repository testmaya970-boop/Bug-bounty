import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// Submitting an incomplete report flags every missing required field at once, field by
// field, and sends nothing -- instead of one generic "request could not be completed".
const fixture = () => JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

test("an incomplete report shows every missing field, clears each as it is fixed, and is not submitted", async ({ page }) => {
  const { organizationId, publicProgramId } = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.veteran@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  const newReport = `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`;
  await page.goto(newReport);
  const draft = page.getByRole("button", { name: "Discard draft" });
  if (await draft.isVisible()) await draft.click(); // start from an empty form

  await page.getByRole("button", { name: "Submit report" }).click();

  await expect(page.getByText("Complete 6 required fields before submitting")).toBeVisible();
  for (const message of [
    "Enter the target where you found the issue.",
    "Enter a short title for the report.",
    "Select the type of weakness you found.",
    "Describe how to reproduce the issue.",
    "Explain the impact: what an attacker could achieve.",
    "Read and accept the program policy before submitting.",
  ]) {
    await expect(page.getByText(message)).toBeVisible();
  }
  await expect(page.getByText("The request could not be completed")).toHaveCount(0);
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(new RegExp(`${newReport}$`)); // nothing was submitted

  // Fixing a field clears just that message and updates the count.
  await page.getByLabel("Title").fill("Partial report");
  await expect(page.getByText("Enter a short title for the report.")).toHaveCount(0);
  await expect(page.getByText("Complete 5 required fields before submitting")).toBeVisible();
});
