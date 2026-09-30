import { test, expect } from "@playwright/test";

// Regression test for a real, previously-shipped bug: typing into the "Organization
// name" field inside CreateOrganizationDialog lost focus to the dialog's close button
// after the very first keystroke. Root cause (see components/ui/navigation.tsx's
// Dialog): the shared Dialog component's focus-management useEffect listed `onClose` in
// its dependency array, and every Dialog caller in this codebase passes a plain inline
// `close` function -- a new identity on every render of that caller, including every
// keystroke into a field whose state that caller owns. The effect therefore re-ran on
// every keystroke, re-executing its "focus the close button" side effect each time. This
// was proven live (not assumed) by instrumenting the actual DOM node identity and
// document.activeElement across the first keystroke: the input node never changed
// identity (no remount), but activeElement moved from the input to the close button
// immediately after `setName` fired. Structural-only unit tests (renderToStaticMarkup,
// this codebase's usual convention) cannot exercise this at all -- effects never run and
// no real focus exists -- so this is a real browser test, not a synthetic one.
test("typing an organization name does not lose focus to the dialog's close button", async ({ page }) => {
  // Needs an organization account (only those are offered the dialog, 202609280002):
  // seed:e2e's org admin. A fresh sign-up can't be used: it stops at an emailed 6-digit
  // verification code, and this test only exercises the dialog -- it never submits, so no
  // state changes.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.admin@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/organizations");

  await page.getByRole("button", { name: /Create (another )?organization/ }).click();
  const nameInput = page.locator('input[required]').first();
  await nameInput.click();

  const targetName = "CloudVault Security";
  await nameInput.pressSequentially(targetName, { delay: 30 });

  // The real failure mode: focus jumping away after the first character means every
  // character after the first is lost. Asserting the full string landed, not just that
  // the field is non-empty, is what would have caught the original bug.
  await expect(nameInput).toHaveValue(targetName);
  await expect(nameInput).toBeFocused();

  // Escape must still close the dialog -- confirms the fix (making the effect depend only
  // on `open`, read the latest onClose through a ref) didn't weaken the existing focus
  // trap or keyboard behavior.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("a researcher account is not offered organization creation", async ({ page }) => {
  // e2e.newcomer signed up as a researcher; the database also refuses the insert itself
  // (organizations_require_organization_account), this proves the UI doesn't offer it.
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.newcomer@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/organizations");

  await expect(page.getByText("This is a researcher account, so it can't create an organization.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create (another )?organization/ })).toHaveCount(0);
});
