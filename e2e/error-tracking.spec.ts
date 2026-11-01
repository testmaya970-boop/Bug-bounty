import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// In-house error tracking end to end: an uncaught browser error is reported
// (components/client-error-listener.tsx -> /api/client-errors -> app_errors) and shows up
// for a platform admin at /platform/errors. Plus the regression that tracking surfaced:
// malformed ids in org-scoped URLs were a 500 (uuid cast in Postgres), now a 404.

const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

test("a browser error reaches /platform/errors; malformed ids are 404 not 500", async ({ page, request }) => {
  const marker = `E2E client boom ${Date.now()}`;

  for (const path of [
    "/organizations/not-a-uuid",
    "/organizations/00000000-0000-0000-0000-000000000000/programs/not-a-uuid",
    "/organizations/00000000-0000-0000-0000-000000000000/programs/00000000-0000-0000-0000-000000000000/reports/not-a-uuid",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }

  await signIn(page, "e2e.newcomer@unpatched.demo");
  await page.goto("/reports");
  // The listener attaches when React hydrates (a useEffect), which can land just after the
  // load event -- errors thrown before that are not captured.
  await expect.poll(() => page.evaluate(() => Object.keys(document).some((k) => k.startsWith("__reactContainer")))).toBe(true);
  await page.waitForTimeout(250);
  const reported = page.waitForResponse((r) => r.url().endsWith("/api/client-errors") && r.request().method() === "POST");
  // A genuinely uncaught error in page context (a timer, outside any React boundary).
  await page.evaluate((m) => setTimeout(() => { throw new Error(m); }), marker);
  expect((await reported).status()).toBe(204);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");

  await signIn(page, "e2e.platform-admin@unpatched.demo");
  await page.goto("/platform/errors?days=1");
  const group = page.getByRole("listitem").filter({ hasText: marker });
  await expect(group).toBeVisible();
  await expect(group.getByText("client", { exact: true })).toBeVisible();
  await expect(group.getByText(/\/reports/)).toBeVisible();
});
