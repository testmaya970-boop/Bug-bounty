import { test, expect } from "./qa-test";

test("new dark security-ops shell: theme, nav, routing, typography, drawer", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sign-in");
  // seed:e2e researcher (demo.researcher is not created by any seed script). Not e2e.veteran:
  // payouts/disclosure specs need that account, and the sign-in limit is 10 per 15 minutes.
  await page.getByLabel(/email/i).fill("e2e.newcomer@unpatched.demo");
  await page.getByRole("textbox", { name: /password/i }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for sign-in to actually finish. A capped wait whose timeout was swallowed let a
  // slow sign-in under full-suite load continue signed out and fail far downstream.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/");
  await page.waitForSelector("nav[aria-label='Primary navigation']");

  // 2. Default dark theme
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const htmlClasses = await page.evaluate(() => document.documentElement.className);
  console.log("BODY_BG:", bodyBg, "HTML_CLASSES:", htmlClasses);

  // 3. Sidebar nav items present
  const navText = await page.evaluate(() => document.querySelector("nav[aria-label='Primary navigation']")?.textContent ?? "");
  console.log("NAV_TEXT:", navText);

  // 4. Navigate through real links, check for 404 / errors
  const navChecks: Record<string, string> = {};
  for (const label of ["Programs", "Reports", "Researchers", "Dashboard"]) {
    const link = page.locator(`nav[aria-label='Primary navigation'] a:has-text("${label}")`).first();
    await link.click();
    await page.waitForLoadState("networkidle");
    const heading = await page.locator("h1").first().textContent().catch(() => null);
    navChecks[label] = `url=${page.url()} heading=${heading}`;
  }
  console.log("NAV_CHECKS:", JSON.stringify(navChecks));

  // 5. Active nav state check on /programs
  await page.goto("/programs");
  await page.waitForSelector("nav[aria-label='Primary navigation']");
  const activeLink = page.locator(`nav[aria-label='Primary navigation'] a[aria-current="page"]`).first();
  const activeStyles = await activeLink.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, borderLeft: cs.borderLeftColor, borderWidth: cs.borderLeftWidth };
  });
  console.log("ACTIVE_NAV_STYLES:", JSON.stringify(activeStyles));

  // 6. The sidebar has a plain search field (no command menu, no shortcuts since Oct 26)
  const hasSearchField = (await page.getByRole("search", { name: "Search programs and reports" }).count()) > 0;
  console.log("SIDEBAR_SEARCH_FIELD:", hasSearchField);

  // 7. Typography check
  const fontInfo = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const body = document.body;
    return { h1Font: h1 ? getComputedStyle(h1).fontFamily : null, bodyFont: getComputedStyle(body).fontFamily };
  });
  console.log("FONT_INFO:", JSON.stringify(fontInfo));

  // 8. Mobile drawer
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const hamburger = page.getByRole("button", { name: /open navigation/i });
  await expect(hamburger).toBeVisible();
  await hamburger.click();
  await page.waitForTimeout(300);
  const drawerVisible = await page.locator("aside").filter({ hasText: "Dashboard" }).isVisible().catch(() => false);
  console.log("MOBILE_DRAWER_VISIBLE:", drawerVisible);
  const closeBtn = page.getByRole("button", { name: /close navigation/i });
  await closeBtn.click();
  await page.waitForTimeout(300);
  const drawerClosedAfter = await page.locator("button[aria-label='Close navigation']").isVisible().catch(() => false);
  console.log("MOBILE_DRAWER_CLOSED_AFTER_CLICK:", !drawerClosedAfter);

  // 10. Light-mode path check
  await page.setViewportSize({ width: 1440, height: 900 });
  const lightModeControl = await page.locator('[aria-label*="theme" i], [title*="theme" i]').count();
  console.log("LIGHT_MODE_TOGGLE_ELEMENTS_FOUND:", lightModeControl);

  console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors));
});
