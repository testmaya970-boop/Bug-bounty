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
  const email = `e2e-org-focus-${Date.now()}@example.test`;
  const password = "Original-Password-123";

  // /sign-up is now the neutral researcher-vs-organization chooser (see
  // docs/decisions/0030-public-entry-and-two-sided-authentication.md); this test needs a
  // real organization owner, so it goes straight to the organization-intent signup route.
  await page.goto("/organizations/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Create account/ }).click();
  await page.waitForURL(/\/organizations/);

  await page.getByRole("button", { name: /Create organization/ }).click();
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
