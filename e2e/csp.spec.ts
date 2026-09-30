import { test, expect, type Page } from "@playwright/test";

// The strict, nonce-based Content-Security-Policy (proxy.ts, lib/security/csp.ts) must not
// break any page. The browser fires `securitypolicyviolation` for everything it blocks;
// this collects them across public, researcher, org and platform-admin pages and fails on
// any. It also checks each page actually hydrated (a blocked framework script would leave
// a dead, server-rendered page that still "looks" fine).

const PASSWORD = "E2ESeed!2026";

async function watchViolations(page: Page) {
  const violations: string[] = [];
  await page.exposeFunction("__reportCspViolation", (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __reportCspViolation: (v: string) => void }).__reportCspViolation(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} on ${location.pathname}`);
    });
  });
  return violations;
}

async function expectHydratedWithCsp(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "load" });
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp, `CSP header on ${path}`).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  // React marks its root container (the whole document, for Next.js) once client JS ran.
  await expect
    .poll(() => page.evaluate(() => Object.keys(document).some((k) => k.startsWith("__reactContainer"))), { message: `${path} hydrated` })
    .toBe(true);
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("CSP: no violations and every page hydrates -- public, researcher, org, platform", async ({ page }) => {
  test.setTimeout(240_000);
  const violations = await watchViolations(page);

  for (const path of ["/", "/sign-in", "/programs", "/design-preview/vanguard-showcase"]) await expectHydratedWithCsp(page, path);

  await signIn(page, "e2e.veteran@unpatched.demo");
  for (const path of ["/", "/programs", "/reports", "/ctf", "/notifications", "/settings/profile"]) await expectHydratedWithCsp(page, path);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");

  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto("/organizations");
  await page.getByRole("link", { name: /E2E Journey Org/ }).click();
  await page.waitForURL(/\/organizations\/[0-9a-f-]{36}$/);
  const org = new URL(page.url()).pathname;
  for (const path of ["", "/programs", "/findings", "/analytics", "/members"]) await expectHydratedWithCsp(page, org + path);
  await page.goto(`${org}/programs`);
  await page.getByRole("link", { name: /E2E Public Program/ }).first().click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  const program = new URL(page.url()).pathname;
  await expectHydratedWithCsp(page, `${program}/inbox`);
  // An interaction, not just a render: open a dialog (client state) under the CSP.
  await expectHydratedWithCsp(page, program);
  await page.getByRole("button", { name: "Add scope" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");

  await signIn(page, "e2e.platform-admin@unpatched.demo");
  for (const path of ["/platform/all-programs", "/platform/programs", "/platform/organizations"]) await expectHydratedWithCsp(page, path);

  expect(violations, violations.join("\n")).toEqual([]);
});

test("CSP: blocks reflected <script> and stored inline-handler XSS while the app still works", async ({ page }) => {
  const violations = await watchViolations(page);
  // Reflected XSS shape: a <script> "echoed" into the server's HTML without the nonce.
  await page.route("**/sign-in", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</body>", "<script>window.__reflected = true</script></body>");
    await route.fulfill({ response, body: html });
  });
  await expectHydratedWithCsp(page, "/sign-in");
  // Stored XSS shape: markup carrying an inline event handler lands in the DOM.
  await page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<img src="data:x" onerror="window.__stored = true">'));
  await expect.poll(() => violations.length).toBeGreaterThanOrEqual(2);
  const ran = await page.evaluate(() => ({ reflected: (window as { __reflected?: boolean }).__reflected === true, stored: (window as { __stored?: boolean }).__stored === true }));
  expect(ran).toEqual({ reflected: false, stored: false });
  expect(violations.join("\n")).toMatch(/script-src-elem/);
  expect(violations.join("\n")).toMatch(/script-src-attr/);
});
