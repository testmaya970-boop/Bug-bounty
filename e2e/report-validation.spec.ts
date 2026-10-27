import { test, expect } from "./qa-test";
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
  await page.goto(newReport); // a fresh composer (drafts only reopen through ?draft=)

  await page.getByRole("button", { name: "Submit report" }).click();

  await expect(page.getByText("Complete 6 required fields before submitting")).toBeVisible();
  for (const message of [
    "Choose the in-scope asset where you found the issue.",
    "Enter a short title for the report.",
    "Select a vulnerability category.",
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

test("a draft keeps its fields and verified files across a reload, a renamed file is refused, and submit attaches the file", async ({ page }) => {
  const { organizationId, publicProgramId } = fixture();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.veteran@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  const newReport = `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`;
  await page.goto(newReport);

  const title = `E2E draft report ${Date.now().toString(36)}`;
  await page.getByLabel("Asset").selectOption({ label: "api.e2e-public.example" });
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Vulnerability category").selectOption("idor");
  await page.getByLabel("Description").fill("Draft E2E: steps to reproduce.");
  await page.getByLabel("Impact").fill("Draft E2E: impact.");

  // A real 1x1 PNG goes straight to storage, then the server verifies it.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const picker = page.getByLabel("Add files");
  await picker.setInputFiles({ name: "poc-screenshot.png", mimeType: "image/png", buffer: png });
  const files = page.getByRole("list", { name: "Attachments" });
  await expect(files.getByText("poc-screenshot.png")).toBeVisible();
  await expect(files.getByText(/Attached/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\?draft=[0-9a-f-]{36}$/);

  // A text file renamed to .png fails the server's file-signature check and is not kept.
  await picker.setInputFiles({ name: "not-really.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByText(/doesn.t look like a real PNG file/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();

  // Reload: the same draft, fields and the verified file come back.
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.getByLabel("Asset")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByRole("list", { name: "Attachments" }).getByText("poc-screenshot.png")).toBeVisible();
  await expect(page.getByText("not-really.png")).toHaveCount(0);
  const draftUrl = page.url();

  // It is listed under My drafts, then reopened from there.
  await page.goto("/reports/drafts");
  await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  await page.goto(draftUrl);

  const accept = page.getByRole("checkbox", { name: /I have read and will follow/ });
  if (await accept.count()) await accept.check();
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("poc-screenshot.png").first()).toBeVisible();
  await expect(page.getByText(/didn.t attach/)).toHaveCount(0);

  // Submitting consumed the draft.
  await page.goto("/reports/drafts");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
});
