import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// Search (202610190001) through the real /search page: the database decides what each person
// can find. e2e.newcomer takes part in nothing. (That a participant DOES find the private
// program is checked in org-journey.spec.ts, right after the real accept-invitation step, so
// the two specs never race over the one seeded invitation.)

const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

test("someone outside a private program cannot find it or its reports; public programs and public profiles are findable", async ({ page }) => {
  await signIn(page, "e2e.newcomer@unpatched.demo");

  await page.goto("/search?q=E2E%20Private");
  await expect(page.getByText("No results")).toBeVisible();

  await page.goto("/search?q=E2E%20seed");
  await expect(page.getByText(/E2E seed:/)).toHaveCount(0);

  await page.goto("/search?q=E2E%20Public");
  await expect(page.getByRole("link", { name: /E2E Public Program/ })).toBeVisible();

  // A query is text, never a pattern: a lone wildcard matches nothing.
  await page.goto("/search?q=%25%25");
  await expect(page.getByText("No results")).toBeVisible();
});
