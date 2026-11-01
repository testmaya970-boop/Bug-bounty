import { readFileSync } from "node:fs";
import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// Organization logos (202610190006) through the real Settings upload and the programs grid:
// a disguised SVG is refused by the server's byte check, and wide and tall logos both sit
// whole inside the same fixed box as the monogram (object-fit: contain), so cards stay aligned.

const PASSWORD = "E2ESeed!2026";
const ORG = "E2E Journey Org";
const fixture = () => JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

/** The logo box and its image: same square footprint as a monogram, image contained inside it. */
async function expectContained(page: Page, img: ReturnType<Page["locator"]>, boxPx: number) {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const m = await img.evaluate((el: HTMLImageElement) => {
    const box = el.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { fit: getComputedStyle(el).objectFit, boxW: box.width, boxH: box.height, inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 };
  });
  expect(m.fit).toBe("contain");
  expect(Math.round(m.boxW)).toBe(boxPx);
  expect(Math.round(m.boxH)).toBe(boxPx);
  expect(m.inside).toBe(true);
}

test.describe.serial("organization logo", () => {
  test("owner uploads wide and tall logos; both fit the same box on program cards; a disguised SVG is refused", async ({ page }) => {
    const { organizationId } = fixture();
    await signIn(page, "e2e.admin@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/settings`);
    const fileInput = page.locator('input[type="file"][accept*="image/png"]');

    // An SVG renamed to .png with a PNG MIME type: only the server's byte check can catch it.
    await fileInput.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: readFileSync("e2e/fixtures/logo.svg") });
    await expect(page.getByText("Use a PNG, JPEG or WebP image.", { exact: true })).toBeVisible();

    for (const [file, label] of [["e2e/fixtures/logo-wide.png", "wide"], ["e2e/fixtures/logo-tall.png", "tall"]] as const) {
      await fileInput.setInputFiles(file);
      const preview = page.getByRole("group", { name: "Organization logo" }).getByRole("img", { name: `${ORG} logo` });
      await expect(page.getByText(/Replace logo/)).toBeVisible();
      await expectContained(page, preview, 48);

      // Searched, not page one: the directory is newest first and other organizations' programs
      // (e.g. the showcase seed) can push this one past the first page.
      await page.goto("/programs?q=E2E%20Journey%20Org");
      await page.getByRole("button", { name: "Grid view" }).click();
      const cardLogo = page.locator("main ul.grid > li").getByRole("img", { name: `${ORG} logo` }).first();
      await expectContained(page, cardLogo, 36);
      // Same footprint as a monogram on another organization's card: rows stay aligned.
      const monogram = page.locator("main ul.grid > li").getByRole("img", { name: /avatar$/ }).first();
      if (await monogram.count()) {
        const size = await monogram.evaluate((el) => Math.round(el.parentElement!.getBoundingClientRect().width));
        expect(size, `${label} logo box matches the monogram box`).toBe(36);
      }
      await page.goto(`/organizations/${organizationId}/settings`);
    }

    // Removing it brings the monogram back.
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Upload logo")).toBeVisible();
    await expect(page.getByRole("group", { name: "Organization logo" }).getByRole("img", { name: `${ORG} logo` })).toHaveCount(0);
  });
});
