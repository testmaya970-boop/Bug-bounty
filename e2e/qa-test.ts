import path from "node:path";
import { test as base } from "@playwright/test";

export * from "@playwright/test";

// Every spec imports `test` from here so the QA drone (e2e/support/qa-drone.js) rides along
// on headed runs: it follows the test's cursor, and on a failure it locks on to the last
// element the test touched and blows it up, so a person watching sees where it broke.
// Headless/CI runs and QA_DRONE=0 skip it entirely; it never changes what a test does.
const DRONE = path.join(__dirname, "support", "qa-drone.js");

export const test = base.extend<{ qaDrone: void }>({
  qaDrone: [
    async ({ context, headless }, use, testInfo) => {
      const on = !headless && process.env.QA_DRONE !== "0";
      if (on) await context.addInitScript({ path: DRONE });
      await use();
      if (!on || testInfo.status === testInfo.expectedStatus) return;
      const label = testInfo.title.slice(0, 90);
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        await page
          .evaluate((l) => (window as unknown as { __qaDrone?: { strike(l: string): Promise<void> } }).__qaDrone?.strike(l), label)
          .catch(() => {}); // a crashed or navigating page just skips the show
      }
    },
    { auto: true },
  ],
});
