import fs from "node:fs";
import { test, expect } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// Response-time metrics and the report-level CSV export (202610220020) for an org owner.

const { organizationId } = JSON.parse(fs.readFileSync("e2e/.seed-fixture.json", "utf8")) as { organizationId: string };
const EMAIL = "e2e.admin@unpatched.demo";

test("owner sees response times with benchmarks and downloads the CSV", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, EMAIL);

  await page.goto(`/organizations/${organizationId}/analytics?range=365`);
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Response times" }) });
  await expect(section).toBeVisible();
  for (const label of ["Time to first response", "Time to triage", "Time to bounty", "Time to resolution"]) {
    await expect(section.getByRole("article", { name: label })).toBeVisible();
  }
  await expect(section.getByText("median").first()).toBeVisible();
  await expect(section.getByRole("table")).toContainText("E2E Public Program");
  // Either a platform comparison or the honest "not enough data" state.
  await expect(section.getByText(/Platform|Not enough data for a platform benchmark/).first()).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), section.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^response-times-.*-365d\.csv$/);
  const csv = fs.readFileSync((await download.path())!, "utf8");
  const lines = csv.trim().split("\r\n");
  expect(lines[0]).toContain('"Report id","Submitted (UTC)","Program","Severity","Status","First response (UTC)"');
  expect(lines.length).toBeGreaterThan(1);
  expect(csv).toContain("E2E Public Program");
});
