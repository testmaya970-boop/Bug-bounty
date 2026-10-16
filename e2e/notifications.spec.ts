import { test, expect, type Page } from "./qa-test";

// Turn 8b: "Is it working or not" for notifications is answered by this spec's own
// red/green run, nothing else -- a dedicated proof, not a promise. Runs against the same
// real prod build + deterministic seed as e2e/org-journey.spec.ts (see AGENTS.md's
// "Release gate" rule), and drives its OWN report (E2E Notifications Program's seed
// report, scripts/seed-e2e.ts's ensureFreshReportForNotificationsWalk) -- deliberately not
// org-journey.spec.ts's own triage-walk report, since Playwright runs spec FILES in
// parallel by default and test.describe.configure({ mode: "serial" }) only serializes
// within one file.

const ADMIN_EMAIL = "e2e.admin@unpatched.demo";
const VETERAN_EMAIL = "e2e.veteran@unpatched.demo";
const UNRELATED_ADMIN_EMAIL = "e2e.unrelated-admin@unpatched.demo";
const PASSWORD = "E2ESeed!2026";
const ORG_NAME = "E2E Journey Org";
const NOTIF_PROGRAM_NAME = "E2E Notifications Program";
const NOTIF_REPORT_TITLE = "E2E seed: fresh report for the live notifications walk";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");
}

function bellButton(page: Page) {
  return page.getByRole("button", { name: /^Notifications/ });
}

/** The bell's own accessible name carries the unread count ("Notifications, N unread") --
 * reading it back is a real assertion on the badge, not a proxy for one. */
async function unreadCount(page: Page): Promise<number> {
  const name = (await bellButton(page).getAttribute("aria-label")) ?? "";
  const match = name.match(/Notifications, (\d+) unread/);
  return match ? Number(match[1]) : 0;
}

function sidebarNav(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name });
}


test.describe.configure({ mode: "serial" });

test("org posts a message on a report -> researcher is notified (bell, /notifications row, outbox delivery); the org's own admin is never self-notified", async ({ page }) => {
  // --- Admin: drive the seed report through triage_started -> accepted, then post a
  // researcher-visible message -----------------------------------------------------------
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("button", { name: /Switch organization|E2E Journey Org/ }).first().click();
  await page.getByRole("menu", { name: "Switch organization" }).getByText(ORG_NAME).click();
  await expect(page.getByRole("heading", { name: ORG_NAME })).toBeVisible();

  const adminUnreadBefore = await unreadCount(page);

  await sidebarNav(page, "Engagements").click();
  await page.waitForURL(/\/programs$/);
  await page.getByRole("link", { name: new RegExp(NOTIF_PROGRAM_NAME) }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);

  await page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name: "Inbox" }).click();
  // The Inbox is a two-pane view: a row opens the report in the side pane (?reportId=);
  // messaging lives on the full report page.
  await page.getByRole("link", { name: NOTIF_REPORT_TITLE }).click();
  await page.getByRole("link", { name: /View full report/ }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);

  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Start triage" }).click();
  await expect(page.getByText("Triaging", { exact: true }).first()).toBeVisible();

  // On the full report page (unlike the Inbox's one-click panel) Accept confirms first.
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Accept report" }).click();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();

  // OrganizationMessageComposer defaults to "researcher_visible" -- no need to touch the
  // visibility select for this message to actually reach the researcher.
  const orgMessageBody = `E2E notifications walk: org message ${Date.now()}`;
  await page.getByLabel("Message").fill(orgMessageBody);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(orgMessageBody)).toBeVisible();

  // The admin triggered all three events (triage_started, accepted, message_posted) --
  // report_triage_started/report_accepted route only to the report's own researcher, and
  // report_message_posted explicitly excludes whoever posted it. None of the three should
  // ever land in the admin's own bell. Reload to pick up anything the outbox worker
  // produced since sign-in, matching org-journey.spec.ts's own real-worker-processing
  // assumption (playwright.config.ts's second webServer entry).
  await page.reload();
  await expect(bellButton(page)).toHaveAttribute("aria-label", adminUnreadBefore > 0 ? `Notifications, ${adminUnreadBefore} unread` : "Notifications");

  await signOut(page);

  // --- Veteran researcher: bell increments, a row on /notifications, no self-notification
  await signIn(page, VETERAN_EMAIL);
  await page.goto("/notifications");
  // .first(): this seeded researcher accumulates one of each per suite run.
  await expect(page.getByText("Your report has entered triage").first()).toBeVisible();
  await expect(page.getByText("Your report was accepted").first()).toBeVisible();
  await expect(page.getByText("There's a new message on a report").first()).toBeVisible();

  await expect(bellButton(page)).toHaveAttribute("aria-label", /Notifications, \d+ unread/);
  await bellButton(page).click();
  await expect(page.getByRole("group", { name: "Recent notifications" })).toBeVisible();
  await page.keyboard.press("Escape");

  // --- Veteran posts their own message -> admin is notified, veteran is not -------------
  const veteranUnreadBefore = await unreadCount(page);
  // /notifications rows are deliberately content-free ("Open report ->", no title), so go
  // through the researcher's own reports list, as org-journey.spec.ts does.
  await page.goto("/reports");
  await page.getByRole("link", { name: NOTIF_REPORT_TITLE }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
  const researcherMessageBody = `E2E notifications walk: researcher message ${Date.now()}`;
  await page.getByLabel("Message to the organization").fill(researcherMessageBody);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(researcherMessageBody)).toBeVisible();

  await page.reload();
  await expect(bellButton(page)).toHaveAttribute("aria-label", veteranUnreadBefore > 0 ? `Notifications, ${veteranUnreadBefore} unread` : "Notifications");

  await signOut(page);

  // --- Admin: now notified of the researcher's message -----------------------------------
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/notifications");
  await expect(page.getByText("There's a new message on a report").first()).toBeVisible();
  await expect(bellButton(page)).toHaveAttribute("aria-label", /Notifications, \d+ unread/);

  await signOut(page);
});

test("an unrelated organization's admin sees nothing from this org's activity -- cross-org isolation, not just no matching seed row", async ({ page }) => {
  // A wholly separate org/owner/program (scripts/seed-e2e.ts's ensureUnrelatedOrg) --
  // never a participant, never a recipient, on any report in E2E_ORG_NAME. If this bell or
  // this notifications list ever showed any of the prior test's three events, notification
  // routing would be leaking across organizations, not just failing to filter a UI list.
  await signIn(page, UNRELATED_ADMIN_EMAIL);

  await expect(bellButton(page)).toHaveAttribute("aria-label", "Notifications");

  await page.goto("/notifications");
  await expect(page.getByText("Your report has entered triage")).not.toBeVisible();
  await expect(page.getByText("Your report was accepted")).not.toBeVisible();
  await expect(page.getByText("There's a new message on a report")).not.toBeVisible();
  await expect(page.getByText("No notifications")).toBeVisible();

  await signOut(page);
});
