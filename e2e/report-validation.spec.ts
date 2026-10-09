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

test("a chosen image that wasn't added blocks submission; once added, it arrives with the report", async ({ page }) => {
  const { organizationId, publicProgramId } = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.veteran@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  const newReport = `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`;
  await page.goto(newReport);
  const draft = page.getByRole("button", { name: "Discard draft" });
  if (await draft.isVisible()) await draft.click();

  const title = `E2E attachment report ${Date.now().toString(36)}`;
  await page.getByLabel("Target type").selectOption("domain");
  await page.getByRole("combobox", { name: "Target", exact: true }).fill("api.e2e-public.example");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Weakness type").selectOption("idor");
  await page.getByLabel("Description").fill("Attachment E2E: steps to reproduce.");
  await page.getByLabel("Impact").fill("Attachment E2E: impact.");
  const accept = page.getByRole("checkbox", { name: /I have read and will follow/ });
  if (await accept.count()) await accept.check();

  // A 1x1 PNG, chosen but NOT added with "Add attachment".
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.locator("#file-evidence-input").setInputFiles({ name: "poc-screenshot.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Submit report" }).click();

  await expect(page.getByText(/You chose "poc-screenshot.png" but didn't add it/)).toBeVisible();
  await expect(page.getByText("Complete 1 required field before submitting")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${newReport}$`)); // not submitted

  await page.getByRole("button", { name: "Add attachment" }).click();
  await expect(page.getByText("poc-screenshot.png").first()).toBeVisible();
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("poc-screenshot.png").first()).toBeVisible();
  await expect(page.getByText(/didn.t attach/)).toHaveCount(0);
});
