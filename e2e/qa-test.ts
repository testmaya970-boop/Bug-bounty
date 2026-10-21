import path from "node:path";
import { test as base, expect as baseExpect, type BrowserContext, type Locator, type Page } from "@playwright/test";

export * from "@playwright/test";

// Every spec imports `test` from here so the QA drone (e2e/support/qa-drone.js) rides along
// on headed runs: it follows the test's cursor, narrates each click/fill/assertion, and on a
// failure it locks on to the last element the test touched and blows it up, so a person
// watching sees where it broke.
// Headless/CI runs and QA_DRONE=0 skip it entirely; it never changes what a test does.
const DRONE = path.join(__dirname, "support", "qa-drone.js");
const droneContexts = new WeakSet<BrowserContext>();

type Drone = { strike(l: string): Promise<void>; expect(el: Element | null, noun: string, fallback: string, id: number): void; done(ok: boolean): void };
type DroneWindow = Window & { __qaDrone?: Drone };
// Referenced inline in each page callback (they are serialized into the page, so they cannot close over module code).

/** Specs that measure speed turn it off (test.use({ qaDroneEnabled: false })) so the overlay never counts against a latency budget. */
export const test = base.extend<{ qaDrone: void; qaDroneEnabled: boolean }>({
  qaDroneEnabled: [true, { option: true }],
  qaDrone: [
    async ({ context, headless, qaDroneEnabled }, use, testInfo) => {
      const on = qaDroneEnabled && !headless && process.env.QA_DRONE !== "0";
      if (on) {
        await context.addInitScript({ path: DRONE });
        droneContexts.add(context);
      }
      await use();
      if (!on) return;
      droneContexts.delete(context);
      const ok = testInfo.status === testInfo.expectedStatus;
      const label = testInfo.title.slice(0, 90);
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        await page
          .evaluate(([l, pass]) => (pass ? (window as DroneWindow).__qaDrone?.done(true) : (window as DroneWindow).__qaDrone?.strike(l)), [label, ok] as const)
          .catch(() => {}); // a crashed or navigating page just skips the show
      }
    },
    { auto: true },
  ],
});

// Assertion narration for the drone. The matcher is returned untouched (never wrapped) so
// Playwright's own stack/location reporting for a failing expect still points at the spec
// line; the drone is only told "this assertion started" when the matcher is looked up. A test
// moving past it is what tells the drone it passed. No-op unless the drone is on for this page.
let expectId = 0;
function announce(subject: unknown, matcher: string, not: boolean) {
  try {
    const s = subject as { evaluateAll?: unknown; page?: unknown; mainFrame?: unknown } | null;
    const isLocator = typeof s?.evaluateAll === "function" && typeof s?.page === "function";
    const page = (isLocator ? (s as Locator).page() : typeof s?.mainFrame === "function" ? (s as Page) : undefined) as Page | undefined;
    if (!page || page.isClosed() || !droneContexts.has(page.context())) return;
    const noun = `${not ? "not " : ""}${matcher.replace(/^to(Have|Be)?/, "").replace(/^./, (c) => c.toLowerCase()) || matcher}`;
    const id = ++expectId;
    if (!isLocator) {
      void page.evaluate(([n, i]) => (window as DroneWindow).__qaDrone?.expect(null, n, "", i), [noun, id] as const).catch(() => {});
      return;
    }
    // The element may not exist yet (the matcher is about to wait for it): re-poll a few times.
    const loc = s as Locator, fallback = String(loc);
    void (async () => {
      for (let tries = 0; tries < 16 && id === expectId && !page.isClosed(); tries++) {
        const found = await loc
          .evaluateAll((els, [n, f, i]) => ((window as DroneWindow).__qaDrone?.expect(els[0] ?? null, n, f, i), els.length > 0), [noun, fallback, id] as const)
          .catch(() => true);
        if (found) return;
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
  } catch {}
}
function narrate<T extends object>(target: T, subject: unknown, not: boolean): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      const value = Reflect.get(t, prop, receiver);
      if (prop === "not" && value && typeof value === "object") return narrate(value, subject, true);
      if (typeof prop === "string" && typeof value === "function" && /^to[A-Z]/.test(prop)) announce(subject, prop, not);
      return value;
    },
  });
}
export const expect = new Proxy(baseExpect, {
  apply(target, thisArg, args: unknown[]) {
    const result = Reflect.apply(target, thisArg, args);
    return result && typeof result === "object" ? narrate(result, args[0], false) : result;
  },
}) as typeof baseExpect;
