import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import { passMfaGate } from "./mfa-gate";

// Black-box security checks against the real production build, over plain HTTP, as an
// outsider would probe it. Complements tests/db (the database boundary) by checking the HTTP
// boundary: headers, redirects, cookies, route guards, cross-tenant URLs and stored XSS. The QA
// drone rides along on headed runs so these show up in the live run like every other spec.

const PASSWORD = "E2ESeed!2026";
const fixture = () =>
  JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as {
    organizationId: string;
    publicProgramId: string;
    privateProgramId: string;
    integrationsOrganizationId: string;
    integrationsProgramId: string;
    integrationsReportId: string | null;
  };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
}

test.describe("HTTP security", () => {
  test("every page sends a strict CSP and the hardening headers", async ({ request }) => {
    for (const path of ["/", "/sign-in", "/programs"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      const h = res.headers();
      expect(h["content-security-policy"], path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], path).toContain("object-src 'none'");
      expect(h["content-security-policy"], path).not.toContain("'unsafe-eval'");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    }
  });

  test("signed-out visitors are sent to sign-in, never shown org, platform or report pages", async ({ request }) => {
    const { organizationId, publicProgramId } = fixture();
    for (const path of [`/organizations/${organizationId}`, `/organizations/${organizationId}/findings`, "/platform", "/platform/payouts", "/reports", `/organizations/${organizationId}/programs/${publicProgramId}/reports/new`]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308], path).toContain(res.status());
      expect(res.headers()["location"], path).toMatch(/\/sign-in/);
    }
    const exportRes = await request.get(`/organizations/${organizationId}/analytics/export?range=90d`, { maxRedirects: 0 });
    expect(exportRes.status()).not.toBe(200);
  });

  test("sign-in never redirects off-site, whatever redirectTo says", async ({ page }) => {
    for (const evil of ["https://evil.example/steal", "//evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      await page.goto(`/sign-in?redirectTo=${encodeURIComponent(evil)}`);
      await page.getByLabel("Email").fill("e2e.hunter@unpatched.demo");
      await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL((url) => url.origin === new URL(page.url()).origin && !url.pathname.startsWith("/sign-in"));
      expect(new URL(page.url()).hostname, evil).not.toBe("evil.example");
      await page.context().clearCookies();
    }
  });

  test("the session cookie is HttpOnly and SameSite", async ({ page }) => {
    await signIn(page, "e2e.hunter@unpatched.demo");
    const cookie = (await page.context().cookies()).find((c) => c.name === "unpatched_session");
    expect(cookie, "session cookie set").toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });

  test("a forged internal header can't change what the server decides", async ({ page }) => {
    await signIn(page, "e2e.hunter@unpatched.demo");
    // The proxy strips this header from inbound requests (lib/session/middleware.ts); sending
    // it must not lock a researcher into the platform-admin MFA setup flow, or unlock anything.
    const res = await page.request.get("/programs", { headers: { "x-unpatched-platform-admin-needs-mfa": "1" }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const platform = await page.request.get("/platform", { headers: { "x-unpatched-platform-admin-needs-mfa": "0", "x-forwarded-for": "127.0.0.1" }, maxRedirects: 0 });
    expect([404, 307, 308, 302, 303]).toContain(platform.status()); // a researcher never sees /platform
  });
});

test.describe("cross-tenant access over HTTP", () => {
  test("a researcher can't open another organization's pages or export its data", async ({ page }) => {
    const { organizationId } = fixture();
    await signIn(page, "e2e.hunter@unpatched.demo");
    for (const path of [`/organizations/${organizationId}/findings`, `/organizations/${organizationId}/payments`, `/organizations/${organizationId}/members`]) {
      await page.goto(path);
      await expect(page.locator("main"), path).toContainText(/do not have access|Permission denied|can.t|not found|isn.t available/i);
    }
    const exportRes = await page.request.get(`/organizations/${organizationId}/analytics/export?range=90d`);
    expect(exportRes.status()).not.toBe(200);
    expect(await exportRes.text()).not.toContain("submitted_at");
  });

  test("an unrelated organization's admin can't read this organization's findings or export", async ({ page }) => {
    const { organizationId } = fixture();
    await signIn(page, "e2e.unrelated-admin@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/findings`);
    await expect(page.locator("main")).toContainText(/do not have access|Permission denied/i);
    const exportRes = await page.request.get(`/organizations/${organizationId}/analytics/export?range=90d`);
    expect(exportRes.status()).not.toBe(200);
  });
});

test.describe("stored XSS", () => {
  test("a comment carrying script and HTML is shown as text, never run, in the editor and on the report", async ({ page }) => {
    const { integrationsOrganizationId, integrationsProgramId, integrationsReportId } = fixture();
    test.skip(!integrationsReportId, "seed:e2e did not create the integrations report");
    let dialog = false;
    page.on("dialog", (d) => {
      dialog = true;
      void d.dismiss();
    });
    // The integrations org's own admin, posting an internal note: nobody else is notified, so
    // the notification counts other specs assert on stay untouched.
    await signIn(page, "e2e.integrations-admin@unpatched.demo");
    await page.goto(`/organizations/${integrationsOrganizationId}/programs/${integrationsProgramId}/reports/${integrationsReportId}`);

    const box = page.getByRole("textbox", { name: "Add a comment", exact: true });
    const live = page.getByTestId("markdown-live");
    // Live formatting: select a word, Ctrl+B, it turns bold in place.
    await box.fill("make this bold");
    await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 9));
    await box.press("Control+b");
    await expect(box).toHaveValue("make **this** bold");
    await expect(live.locator("strong")).toHaveText("**this**");

    const marker = `xss-${Date.now()}`;
    const payload = `${marker} <img src=x onerror="window.__xss=1"><script>window.__xss=1</script><a href="javascript:window.__xss=1">x</a>`;
    await box.fill(payload);
    await expect(live).toContainText("<script>");
    await page.getByLabel("Visible to").selectOption("internal");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText(marker).first()).toBeVisible();

    await page.reload();
    const posted = page.locator("main").getByText(marker).first();
    await expect(posted).toContainText("<script>");
    expect(await page.evaluate(() => (window as Window & { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('main img[src="x"], main [onerror], main a[href^="javascript:"]')).toHaveCount(0);
    expect(dialog, "no alert/confirm dialog fired").toBe(false);
  });
});

test.describe("brute force", () => {
  test("repeated wrong passwords for one account are cut off", async ({ page }) => {
    // A throwaway address: the limiter keys on the attempted email (10 per 15 minutes,
    // 202608290005), so this never locks a real seeded account out of other specs.
    const email = `bruteforce.${Date.now()}@unpatched.demo`;
    await page.goto("/sign-in");
    let limited = false;
    for (let i = 0; i < 13 && !limited; i++) {
      await page.getByLabel("Email").fill(email);
      await page.getByRole("textbox", { name: "Password" }).fill(`wrong-password-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      const alert = page.getByRole("alert").filter({ hasText: /Incorrect email or password|Too many/ });
      await expect(alert).toBeVisible();
      limited = /Too many/.test(await alert.innerText());
    }
    expect(limited, "the limiter stepped in before 13 attempts").toBe(true);
  });
});
