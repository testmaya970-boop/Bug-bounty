import { test, expect, type Page, type Response } from "./qa-test";

// seed:e2e researcher -- the earlier demo.researcher account is created by no seed script,
// so this spec could only pass on the one machine where it was hand-made.
const EMAIL = "e2e.newcomer@unpatched.demo";
const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const start = performance.now();
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 60000 });
  const end = performance.now();
  console.log(`SIGN_IN_MS=${Math.round(end - start)}`);
}

type Measurement = {
  label: string;
  ms: number;
  url: string;
  method: string;
  contentType: string | null;
  status: number;
};

async function measureClick(page: Page, label: string, clickFn: () => Promise<void>, urlPredicate: (url: string) => boolean): Promise<Measurement> {
  const start = performance.now();
  const [response] = await Promise.all([
    page.waitForResponse((res) => urlPredicate(res.url()) && res.request().method() !== "GET" || (urlPredicate(res.url()) && res.request().method() === "GET"), { timeout: 20000 }).catch(() => null as Response | null),
    clickFn(),
  ]);
  const end = performance.now();
  const ms = Math.round(end - start);
  if (!response) {
    return { label, ms, url: "(no matching response captured)", method: "?", contentType: null, status: 0 };
  }
  return {
    label,
    ms,
    url: response.url(),
    method: response.request().method(),
    contentType: response.headers()["content-type"] ?? null,
    status: response.status(),
  };
}

test("measure button click latencies across app", async ({ page }) => {
  const results: Measurement[] = [];

  await signIn(page);

  // --- 1. /programs?tab=all -> "Load more" button (client-side server action) ---
  await page.goto("/programs?tab=all");
  await page.waitForLoadState("networkidle");
  const loadMoreBtn = page.getByRole("button", { name: /Load more/i });
  if (await loadMoreBtn.count()) {
    const isActionResponse = (url: string) => url.includes("/programs");
    const first = await measureClick(page, "Programs > Load more (1st, fresh nav)", () => loadMoreBtn.click(), isActionResponse);
    results.push(first);
    // steady state: click again if still present. Wait for the first load to settle first:
    // while pending the button is disabled, and on the last page it is then removed -- a
    // count() taken mid-load saw the disabled button and the click then waited forever.
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((b) => /Load more/i.test(b.textContent ?? ""));
      return !button || !button.disabled;
    });
    const loadMoreBtn2 = page.getByRole("button", { name: /Load more/i });
    if (await loadMoreBtn2.count()) {
      const second = await measureClick(page, "Programs > Load more (2nd, steady-state)", () => loadMoreBtn2.click(), isActionResponse);
      results.push(second);
    } else {
      results.push({ label: "Programs > Load more (2nd, steady-state)", ms: -1, url: "(no more pages / button gone)", method: "-", contentType: null, status: 0 });
    }
  } else {
    results.push({ label: "Programs > Load more", ms: -1, url: "(button not present)", method: "-", contentType: null, status: 0 });
  }

  // (API tokens are "coming soon": nothing to click on /settings/api-tokens.)

  // --- 3. /settings/report-templates -> Save template (real server action click) ---
  await page.goto("/settings/report-templates");
  await page.waitForLoadState("networkidle");
  const isTemplateResponse = (url: string) => url.includes("/settings/report-templates");
  async function createTemplate(n: number) {
    await page.getByRole("button", { name: /New template/i }).click();
    await page.getByLabel("Template name").fill(`perf-test-template-${Date.now()}-${n}`);
    const saveBtn = page.getByRole("button", { name: /Save template/i });
    return measureClick(page, `Report Templates > Save (${n === 1 ? "1st, fresh nav" : "2nd, steady-state"})`, () => saveBtn.click(), isTemplateResponse);
  }
  results.push(await createTemplate(1));
  results.push(await createTemplate(2));

  // Clean up: delete the two templates we just created
  const deleteButtons = page.getByRole("button", { name: /Delete/i });
  const deleteCount = await deleteButtons.count();
  for (let i = 0; i < Math.min(2, deleteCount); i++) {
    const btn = page.getByRole("button", { name: /Delete/i }).first();
    const m = await measureClick(page, `Report Templates > Delete (${i === 0 ? "1st" : "2nd"})`, () => btn.click(), isTemplateResponse);
    results.push(m);
  }

  // Print results as a table for extraction from test output
  console.log("\n=== PERF MEASUREMENTS ===");
  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  console.log("=== END PERF MEASUREMENTS ===\n");

  expect(results.length).toBeGreaterThan(0);
});
