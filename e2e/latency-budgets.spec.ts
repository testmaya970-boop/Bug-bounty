import { test, expect, type Page } from "./qa-test";

// Measure the app, not the QA overlay.
test.use({ qaDroneEnabled: false });

// docs/launch-qa.md's latency budgets, measured the way that doc specifies: against the
// prod build playwright.config.ts starts, seed:launch accounts, 1 warm-up + 3 measured
// hits per route with waitUntil "load", median of the 3. Each measurement is broken down
// from the browser's Navigation Timing entry (AGENTS.md: latency claims need a
// TTFB / server / transfer / client breakdown):
//   ttfb     startTime -> responseStart (includes server time; connect is ~0 on localhost)
//   server   requestStart -> responseStart (server work before the first byte)
//   transfer responseStart -> responseEnd (Next.js streams HTML, so this includes any
//            server rendering that streams after the first byte, e.g. Suspense boundaries)
//   client   responseEnd -> loadEventEnd (parse, scripts, hydration start)
//   total    startTime -> loadEventEnd (what the budget is checked against)
// Budgets fail the test; docs/launch-qa.md records results.

const PASSWORD = "SentinelLaunch!2026";
const ORG_NAME = "Launch Checklist Org";
const PROGRAM_NAME = "Launch Checklist Program";

type Timing = { ttfb: number; server: number; transfer: number; client: number; total: number };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function navigationTiming(page: Page): Promise<Timing> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {
      ttfb: nav.responseStart - nav.startTime,
      server: nav.responseStart - nav.requestStart,
      transfer: nav.responseEnd - nav.responseStart,
      client: nav.loadEventEnd - nav.responseEnd,
      total: nav.loadEventEnd - nav.startTime,
    };
  });
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function measure(page: Page, label: string, path: string, budgetMs: number) {
  await page.goto(path, { waitUntil: "load" }); // warm-up, not counted
  const hits: Timing[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(path, { waitUntil: "load" });
    // loadEventEnd is 0 until the load handler finishes; wait for it to be recorded.
    await page.waitForFunction(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd > 0);
    hits.push(await navigationTiming(page));
  }
  // The median hit by total, reported whole, so its parts add up.
  const mid = [...hits].sort((a, b) => a.total - b.total)[1];
  const row = Object.fromEntries(Object.entries(mid).map(([k, v]) => [k, Math.round(v)])) as Timing;
  console.log(`LATENCY ${JSON.stringify({ label, path, budgetMs, ...row, totals: hits.map((h) => Math.round(h.total)) })}`);
  expect.soft(median(hits.map((h) => h.total)), `${label} median load`).toBeLessThanOrEqual(budgetMs);
}

test("latency budgets: org routes (launch.admin)", async ({ page }) => {
  await signIn(page, "launch.admin@unpatched.demo");
  await page.goto("/organizations");
  await page.getByRole("link", { name: new RegExp(ORG_NAME) }).click();
  await page.waitForURL(/\/organizations\/[0-9a-f-]{36}$/);
  const orgPath = new URL(page.url()).pathname;
  await page.goto(`${orgPath}/programs`);
  await page.getByRole("link", { name: new RegExp(PROGRAM_NAME) }).first().click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  const programPath = new URL(page.url()).pathname;

  await measure(page, "Org dashboard (Home)", orgPath, 500);
  await measure(page, "Engagements", `${orgPath}/programs`, 600);
  await measure(page, "Findings", `${orgPath}/findings`, 600);
  await measure(page, "Program inbox", `${programPath}/inbox`, 600);
});

test("latency budgets: researcher routes (launch.researcher)", async ({ page }) => {
  await signIn(page, "launch.researcher@unpatched.demo");
  await measure(page, "Researcher home", "/", 800);
  await measure(page, "CTF", "/ctf", 1000);
});
