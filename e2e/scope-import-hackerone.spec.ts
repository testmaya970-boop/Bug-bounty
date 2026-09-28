import { test, expect } from "@playwright/test";
import path from "node:path";

// A HackerOne scope CSV export (e2e/fixtures/hackerone-scope.csv: BOM, multi-line quoted
// instruction, eligible_for_submission=false, bare-hostname URL assets, one free-text
// OTHER) imported through the real dialog into a fresh draft engagement, so every row also
// passes the database's own canonicalize_scope_target, not just the client parser.

test("scope import: a HackerOne scope CSV export imports as-is", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.launch-admin@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  await page.goto("/organizations");
  await page.getByRole("link", { name: /E2E Launch Org/ }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Engagements" }).click();
  await page.waitForURL(/\/programs$/);
  // .first(): with zero programs the page shows both a header and an empty-state trigger.
  await page.getByRole("button", { name: /Create (another )?engagement/ }).first().click();
  await page.getByLabel("Engagement name").fill(`H1 Import ${Date.now()}`);
  await page.getByRole("dialog").getByRole("button", { name: "Create engagement" }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Import scope entries" });
  await dialog.getByLabel("File", { exact: true }).setInputFiles(path.join(__dirname, "fixtures", "hackerone-scope.csv"));
  await expect(dialog.getByText(/8 rows will be submitted, 1 skipped/)).toBeVisible();
  await page.screenshot({ path: "test-results/scope-import/1-preview.png", fullPage: true });

  await dialog.getByRole("button", { name: "Import 8 entries" }).click();
  await expect(dialog.getByText("8 added.")).toBeVisible();
  await page.screenshot({ path: "test-results/scope-import/2-result.png", fullPage: true });
  await dialog.getByRole("button", { name: "Done" }).click();

  for (const target of ["*.acme.com", "www.acme.com", "203.0.113.0/24", "com.acme.app", "status.acme.com"]) {
    await expect(page.getByText(target, { exact: true }).first()).toBeVisible();
  }
});
