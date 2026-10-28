import { test, expect, type Page } from "./qa-test";

// Discovery filters run in the database, and report drafts live on the server
// (db/migrations/202610060014). seed:e2e clears e2e drafts every run.

const PASSWORD = "E2ESeed!2026";
const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("signed out, the program registry filters by program type on the server", async ({ page }) => {
  await page.goto("/programs");
  await page.getByLabel("Filter by program type").selectOption("vdp");
  await page.getByLabel("Sort").selectOption("name");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/programType=vdp/);
  await expect(page).toHaveURL(/sort=name/);
  // Every listed program is disclosure-only (or nothing matches) -- never the bounty program.
  await expect(page.getByRole("link", { name: "E2E Public Program" })).toHaveCount(0);
  if ((await page.getByText("No matching public programs").count()) === 0) {
    await expect(page.locator("main span", { hasText: "Disclosure only" }).first()).toBeVisible();
  }
});

test("a report draft is kept on the server, not in the browser", async ({ browser }) => {
  const { organizationId, publicProgramId } = await fixture();
  const newReport = `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`;
  const title = `Draft kept on the server ${Date.now().toString(36)}`;

  const first = await browser.newContext();
  const page = await first.newPage();
  await signIn(page, "e2e.hunter@unpatched.demo");
  await page.goto(newReport);
  await page.getByLabel("Title").fill(title);
  await page.waitForTimeout(2500); // the form saves after 800ms of quiet
  await first.close();

  // A brand-new browser context: no localStorage, no cookies carried over.
  const second = await browser.newContext();
  const fresh = await second.newPage();
  await signIn(fresh, "e2e.hunter@unpatched.demo");
  // Since multiple drafts (202610260004), a draft is reopened from My drafts; /reports/new starts a new one.
  await fresh.goto("/reports/drafts");
  await fresh.getByRole("link", { name: title }).first().click();
  await expect(fresh.getByLabel("Title")).toHaveValue(title);
  await second.close();
});
