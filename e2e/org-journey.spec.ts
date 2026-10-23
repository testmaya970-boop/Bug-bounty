import { test, expect, type Page } from "./qa-test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Turn 8: the release-gate journey suite (see AGENTS.md's "Release gate" rule). Runs
// against the real prod build (playwright.config.ts's webServer runs `next build && next
// start`) with the deterministic dataset from `npm run seed:e2e` (scripts/seed-e2e.ts) --
// run that script before this spec; it is idempotent, so re-running it is always safe.
//
// Selector policy: roles/labels first (getByRole, getByLabel, getByText) -- data-testid
// only where a role is genuinely ambiguous (none needed in this spec so far). No arbitrary
// sleeps anywhere -- every wait is an assertion (expect(...).toBeVisible(), waitForURL) or
// Playwright's own auto-waiting built into locator actions.

const ADMIN_EMAIL = "e2e.admin@unpatched.demo";
const INVITED_EMAIL = "e2e.invited@unpatched.demo";
const VETERAN_EMAIL = "e2e.veteran@unpatched.demo";
const NEWCOMER_EMAIL = "e2e.newcomer@unpatched.demo";
const PASSWORD = "E2ESeed!2026";
const ORG_NAME = "E2E Journey Org";
const PUBLIC_PROGRAM_NAME = "E2E Public Program";
const PRIVATE_PROGRAM_NAME = "E2E Private Program";
const TRIAGE_WALK_REPORT_TITLE = "E2E seed: fresh report for the live triage walk";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  // getByLabel("Password") alone is ambiguous: the field's own "Show password" toggle
  // button also carries an accessible name containing "Password" -- getByRole narrows to
  // the actual textbox.
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

/** Turn 8b: OrganizationHeader's own "Organization sections" tab bar is deleted (AGENTS.md's
 * "One nav control per hierarchy level" rule) -- the sidebar (components/app-shell-client.tsx,
 * "Primary navigation" landmark) is now the single org nav. "Engagements" (and every other
 * former tab label) still collides with the Breadcrumb's own "Engagements" link on program
 * pages, so this stays scoped to the sidebar landmark specifically rather than a bare
 * getByRole("link", { name }). */
function sidebarNav(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name });
}

/** From a PROGRAM page, the real way back to the org's engagement list is the page's own
 * Breadcrumb (which carries a real "Engagements" link alongside "Organizations") -- scoped to
 * the breadcrumb landmark specifically, since "Engagements" is also a real sidebar destination
 * on the same page and a bare getByRole("link", { name: "Engagements" }) would be ambiguous. */
function breadcrumbEngagements(page: Page) {
  return page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Engagements" });
}

/** Every one of the nine org routes must highlight exactly one nav control -- the sidebar item
 * matching that route (AGENTS.md's "One nav control per hierarchy level" rule, added closing the
 * Turn 8b defect where the deleted tab row and the sidebar could each independently show no
 * active item on the same page). Asserts both halves: exactly one org-level nav LINK marked
 * aria-current="page", and it is the expected sidebar link. Not counted, because neither is a
 * competing org-level control: the breadcrumb's current crumb (a plain <span>, the standard
 * accessible breadcrumb pattern) and the program-level "Program sections" tabs, a different
 * hierarchy level the rule explicitly allows. */
async function expectSingleSidebarHighlight(page: Page, name: string) {
  const current = page.locator('a[aria-current="page"]:not(nav[aria-label="Program sections"] a)');
  await expect(current).toHaveCount(1);
  await expect(sidebarNav(page, name)).toHaveAttribute("aria-current", "page");
}

/** ProgramHeader's own "Program sections" tab bar -- distinct from, and NOT the same
 * destination as, the org header's "Researchers" tab (that one is the org-wide
 * cross-program researcher directory, /organizations/{id}/researchers). This is the one
 * program page's own #researchers anchor section, where InviteResearcherDialog lives. */
function programTab(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Program sections" }).getByRole("link", { name });
}

async function signOut(page: Page) {
  // AccountMenu (components/app-shell-client.tsx) -- opened via the avatar button in the
  // header, which carries "Account menu" as its accessible name (sr-only span).
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in" || url.pathname === "/");
}

test.describe.configure({ mode: "serial" });

test("org journey: admin sign-in through Home, Engagements, invite, triage, bounty, notifications, and every reachable surface", async ({ page }) => {
  // --- Sign in -> org appears in the switcher -----------------------------------------
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("button", { name: /Switch organization|E2E Journey Org/ }).first().click();
  await expect(page.getByRole("menu", { name: "Switch organization" }).getByText(ORG_NAME)).toBeVisible();
  // OrganizationSwitcher (app-shell-client.tsx) closes on outside click only, not Escape.
  // Clicking its own org entry both closes the dropdown and does the real navigation into
  // that organization's Home -- the switcher's actual real behavior, not a typed URL.
  await page.getByRole("menu", { name: "Switch organization" }).getByText(ORG_NAME).click();
  await expect(page.getByRole("heading", { name: ORG_NAME })).toBeVisible();

  // --- Org Home: KPIs + one action queue, no record shown twice -----------------------
  await expect(page.getByText("Active engagements")).toBeVisible();
  await expect(page.getByText("Open reports")).toBeVisible();
  await expect(page.getByText("Median time to first triage")).toBeVisible();
  await expect(page.getByText("Total paid")).toBeVisible();
  // The one seeded `new` report must appear exactly once on Home, in the action queue --
  // never duplicated across two sections (the Turn 6 bug this page's rewrite fixed).
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE)).toHaveCount(1);

  // --- Engagements: both programs visible to the admin --------------------------------
  await sidebarNav(page, "Engagements").click();
  // .first(): the Engagements list may render a responsive table/card duplicate per entry.
  await expect(page.getByText(PUBLIC_PROGRAM_NAME).first()).toBeVisible();
  await expect(page.getByText(PRIVATE_PROGRAM_NAME).first()).toBeVisible();

  // --- Create a public program ---------------------------------------------------------
  // CreateProgramDialog's trigger label is "Create engagement" with zero existing
  // programs, "Create another engagement" once any exist (both seeded programs already
  // do) -- the dialog's own submit button is always exactly "Create engagement".
  const publicName = `E2E Live Public ${Date.now()}`;
  await page.getByRole("button", { name: /Create (another )?engagement/ }).click();
  await page.getByLabel("Engagement name").fill(publicName);
  await page.getByRole("button", { name: "Create engagement" }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: publicName })).toBeVisible();
  // Fresh programs start private -- toggle it public via the real visibility switch. The
  // program page has a second switch (KYC requirement) -- scope by the visibility switch's
  // own accessible name (its label reads "Private: ..." while unchecked).
  await page.getByRole("switch", { name: /^Private:/ }).click();
  await expect(page.getByText(/Public: researchers can discover this program/)).toBeVisible();

  // Add scope while still draft (create+disable, driven live here since scope mutation is
  // only legal in draft -- the seeded active programs can no longer accept scope changes).
  await page.getByRole("button", { name: "Add scope" }).click();
  // getByLabel("Target") ambiguously matches both this field and the dialog's own "Target
  // type" select -- getByRole narrows to the actual text input.
  await page.getByRole("textbox", { name: "Target" }).fill("api.e2e-live-public.example");
  await page.getByRole("button", { name: "Add scope entry" }).click();
  await expect(page.getByText("api.e2e-live-public.example")).toBeVisible();
  // Disable it (remove_scope_entry -- a soft status='removed', never a hard delete).
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove scope entry" }).click();
  // Wait for the confirm dialog itself to close before asserting absence -- while open, it
  // holds a second, real copy of the target text that would otherwise race this check.
  await expect(page.getByRole("dialog", { name: "Remove scope entry?" })).not.toBeVisible();
  await expect(page.getByText("api.e2e-live-public.example")).not.toBeVisible();

  // --- Create a private program ---------------------------------------------------------
  await breadcrumbEngagements(page).click();
  const privateName = `E2E Live Private ${Date.now()}`;
  await page.getByRole("button", { name: /Create (another )?engagement/ }).click();
  await page.getByLabel("Engagement name").fill(privateName);
  await page.getByRole("button", { name: "Create engagement" }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: privateName })).toBeVisible();
  // Left private (the schema default) -- no visibility toggle needed.
  await expect(page.getByText(/Private: not listed publicly/)).toBeVisible();

  // --- Invite a researcher to the (seeded, real) private program via the existing panel -
  await page.goto("/organizations");
  // getByText(ORG_NAME) alone matches both the /organizations picker's real card link and
  // the sidebar's own OrganizationSwitcher button, both rendering the org name -- scope to
  // the real link role.
  await page.getByRole("link", { name: new RegExp(ORG_NAME) }).click();
  await sidebarNav(page, "Engagements").click();
  await page.waitForURL(/\/programs$/);
  await page.getByRole("link", { name: new RegExp(PRIVATE_PROGRAM_NAME) }).click();
  // ProgramHeader's own Researchers tab (an in-page #researchers anchor), not the org
  // header's Researchers tab (a different destination: the org-wide directory).
  await programTab(page, "Researchers").click();
  const freshInviteEmail = `e2e.fresh-invite-${Date.now()}@unpatched.demo`;
  await page.getByRole("button", { name: "Invite researcher" }).click();
  await page.getByLabel("Email").fill(freshInviteEmail);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(freshInviteEmail)).toBeVisible();
  await page.getByRole("button", { name: "Send invitation" }).click();
  // The dialog now ends on the invitation link (shown once) and whether the email went out.
  await expect(page.getByLabel("Invitation link")).toHaveValue(/\/program-invitations\/[A-Za-z0-9_-]+$/);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Invite researcher" })).toBeVisible(); // dialog closed, back to the trigger
  // The trigger button's own visibility doesn't guarantee the Dialog's backdrop overlay
  // (role="presentation", components/ui/navigation.tsx) has actually unmounted -- it can
  // still intercept pointer events for a brief window after the trigger re-appears,
  // causing the very next click (breadcrumbEngagements below) to silently retry against
  // it instead of the real link underneath. Wait for the overlay itself to be gone.
  await expect(page.getByRole("presentation")).not.toBeVisible();

  // --- Findings: filter by status ------------------------------------------------------
  // Currently on the private program's own page (ProgramHeader) -- reach Findings via the
  // breadcrumb back to Engagements, then the org header's own Findings tab.
  await breadcrumbEngagements(page).click();
  await sidebarNav(page, "Findings").click();
  await page.waitForURL(/\/findings$/);
  // OrganizationFindingsTable renders a responsive table/card split -- the same real link
  // exists twice in the DOM (one hidden per breakpoint), so .first() rather than a bare
  // toBeVisible() which requires exactly one match. Each filter change is a real
  // router.push navigation (organization-findings-table.tsx's own navigateWithFilters) --
  // waitForURL confirms the query param actually landed before asserting on its result,
  // rather than racing the transition.
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE).first()).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("new");
  await page.waitForURL(/status=new/);
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE).first()).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("resolved");
  await page.waitForURL(/status=resolved/);
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE)).toHaveCount(0);
  await page.getByLabel("Filter by status").selectOption("all");
  await page.waitForURL(/\/findings$/);
  // Search and order (21 Oct): a fragment of the title finds it, nonsense finds nothing,
  // and the order switch is carried in the URL.
  const findingsSearch = page.getByRole("search", { name: "Search findings" });
  await findingsSearch.getByLabel("Search findings").fill(TRIAGE_WALK_REPORT_TITLE.slice(0, 18));
  await findingsSearch.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=/);
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE).first()).toBeVisible();
  await findingsSearch.getByLabel("Search findings").fill("zz-no-such-finding-zz");
  await findingsSearch.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=zz-no-such-finding-zz/);
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE)).toHaveCount(0);
  await findingsSearch.getByLabel("Search findings").fill("");
  await findingsSearch.getByLabel("Order").selectOption("oldest");
  await page.waitForURL(/sort=oldest/);
  await expect(page.getByText(TRIAGE_WALK_REPORT_TITLE).first()).toBeVisible();
  await findingsSearch.getByLabel("Order").selectOption("newest");
  await page.waitForURL(/\/findings$/);

  // --- Inbox: new -> triaged -> resolved -> finalize bounty ----------------------------
  await sidebarNav(page, "Engagements").click();
  await page.waitForURL(/\/programs$/);
  // getByText(PUBLIC_PROGRAM_NAME) alone can match a filter <option> or a duplicated
  // responsive card cell on other pages -- scope to the real program-card link on the
  // Engagements list specifically.
  await page.getByRole("link", { name: new RegExp(PUBLIC_PROGRAM_NAME) }).click();
  // Inbox is a program-level tab (ProgramHeader), not an org-level one.
  await programTab(page, "Inbox").click();
  await page.getByRole("link", { name: TRIAGE_WALK_REPORT_TITLE }).click();
  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Start triage" }).click();
  await expect(page.getByText("Triaging", { exact: true }).first()).toBeVisible();

  // The Inbox's own quick-action panel (InboxTriageControls) is a deliberately different,
  // simpler pattern than the report detail page's own two-step confirm dialog -- Accept
  // fires directly, no second confirm button.
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();

  // --- Switch to the full report detail page for severity + bounty -- both live only
  // there (bounty-decision.tsx's SeverityControl/BountyDecisionSection), and severity
  // must be set BEFORE resolving: SeverityControl locks (read-only) once the report
  // reaches a terminal status (isFinal = allowedNext.length === 0), so setting it after
  // Resolve is structurally too late, not a timing race.
  await page.getByRole("link", { name: "View full report" }).click();
  await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
  const severitySelect = page.getByLabel("Confirmed severity");
  await expect(severitySelect).toBeEnabled();
  await severitySelect.selectOption("high");
  // Before a final decision the bounty section explains why it can't be calculated yet,
  // rather than offering a button calculate_bounty_recommendation would reject.
  await expect(page.getByText(/can be calculated once this report reaches a final decision/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate bounty" })).toHaveCount(0);

  // Resolve from this same page (TriageActionPanel is present here too, identical action
  // set to the Inbox's own panel).
  await page.getByRole("button", { name: "Resolve" }).click();
  // By accessible name: the label's text also carries the required asterisk.
  await page.getByRole("textbox", { name: "How was this resolved?" }).fill("Fixed for the E2E journey suite.");
  await page.getByRole("button", { name: "Resolve report" }).click();
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();

  // Bounty is calculated only once the report is final (REPORT_NOT_FINALIZED otherwise),
  // and must be calculated before Finalize bounty renders.
  await page.getByRole("button", { name: "Calculate bounty" }).click();
  await expect(page.getByRole("button", { name: "Finalize bounty" })).toBeVisible();

  // --- Finalize bounty: assert the payout wording is visible in the confirm step -------
  await page.getByRole("button", { name: "Finalize bounty" }).click();
  await page.getByLabel(/Amount/).fill("500.00");
  // Outside the policy range, so a reason is required (202610120001).
  await page.getByLabel("Note").fill("Agreed with the researcher for this E2E finding.");
  await page.getByRole("button", { name: "Continue" }).click();
  // Since 2026-10-23 the organization funds the bounty only; the fee comes from the researcher.
  await expect(page.getByText(/Paying it takes the bounty from your organization/)).toBeVisible();
  // What finalizing will check, shown before committing (202610190002): the 500 bounty alone.
  await expect(page.locator("dd", { hasText: "USD 500.00" })).toBeVisible();
  await expect(page.getByText("Covers it")).toBeVisible();
  await page.getByRole("button", { name: "Confirm finalization" }).click();
  // .first(): once the outbox worker creates the payment obligation, the payment-status
  // panel shows the amount too.
  await expect(page.getByText(/USD 500\.00/).first()).toBeVisible();

  // --- Activity shows the transitions --------------------------------------------------
  // Currently on the Inbox page (ProgramHeader) -- breadcrumb back to Engagements, then
  // the org header's own Activity tab (Activity itself is org-scoped, not per-program).
  await breadcrumbEngagements(page).click();
  await sidebarNav(page, "Audit log").click();
  // .first(): the audit log keeps every past run's events for this seeded report.
  await expect(page.getByText(/started triage/i).first()).toBeVisible();
  await expect(page.getByText(/accepted a report/i).first()).toBeVisible();
  await expect(page.getByText(/resolved a report/i).first()).toBeVisible();
  await expect(page.getByText(/finalized a bounty/i).first()).toBeVisible();

  // --- Bell shows the new notifications (proves the Turn 8 notification handlers) -------
  // report.accepted's notification routes to the report's own researcher (the veteran),
  // not the admin who triaged it -- so the admin's own bell would show nothing for THIS
  // event. What the admin bell DOES show: the researcher-visible message the researcher
  // will post below, once that happens. Checked from the researcher's own session instead,
  // right after triage/accept/resolve -- see the researcher leg below.

  // --- Analytics ---------------------------------------------------------------------
  // Already on an org-scoped page (Activity) -- Analytics is org-wide too.
  await sidebarNav(page, "Analytics").click();
  await expect(page.getByRole("heading", { name: /Analytics/ })).toBeVisible();

  // --- Help / profile menu / switchers reachable ---------------------------------------
  // Help lives in the account menu (and the command menu); there is no top bar on desktop.
  await page.getByRole("button", { name: /Account menu/ }).first().click();
  await page.getByRole("link", { name: "Help & docs" }).first().click();
  await expect(page.getByRole("heading", { name: "Get help" })).toBeVisible();
  // Help has its own minimal header (Back to workspace / Sign out), no account menu.
  await page.getByRole("link", { name: "Back to workspace" }).click();

  await page.getByRole("button", { name: "Account menu" }).click();
  // Scoped to the open dropdown: the sidebar has its own Settings link.
  const accountMenu = page.getByRole("group", { name: "Account" });
  await expect(accountMenu.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(accountMenu.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(accountMenu.getByRole("link", { name: "Help & docs" })).toBeVisible();
  await page.keyboard.press("Escape");

  // --- Sign out --------------------------------------------------------------------------
  await signOut(page);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("nav de-duplication: every one of the nine org routes highlights exactly one nav control -- the sidebar item matching that route", async ({ page }) => {
  // AGENTS.md's "One nav control per hierarchy level" rule, added this turn: the deleted
  // org-level tab row and the sidebar could each independently show no active item on the
  // same page (a program sub-route, a member-detail page). This is the proof, not a promise
  // -- every org route, one assertion each, against the real deployed app.
  await signIn(page, ADMIN_EMAIL);
  await page.getByRole("button", { name: /Switch organization|E2E Journey Org/ }).first().click();
  await page.getByRole("menu", { name: "Switch organization" }).getByText(ORG_NAME).click();
  await expect(page.getByRole("heading", { name: ORG_NAME })).toBeVisible();

  await expectSingleSidebarHighlight(page, "Home");

  await sidebarNav(page, "Engagements").click();
  await page.waitForURL(/\/programs$/);
  await expectSingleSidebarHighlight(page, "Engagements");

  // A specific program's own sub-route must still keep the parent sidebar item ("Engagements")
  // highlighted -- prefixMatch, not exactMatch (app-shell-client.tsx). This is exactly the case
  // the old tab row's `active === item.id` string check could never match.
  await page.getByRole("link", { name: new RegExp(PUBLIC_PROGRAM_NAME) }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);
  await expectSingleSidebarHighlight(page, "Engagements");

  await breadcrumbEngagements(page).click();
  await sidebarNav(page, "Findings").click();
  await page.waitForURL(/\/findings$/);
  await expectSingleSidebarHighlight(page, "Findings");

  await sidebarNav(page, "Assets").click();
  await page.waitForURL(/\/assets$/);
  await expectSingleSidebarHighlight(page, "Assets");

  await sidebarNav(page, "Researchers").click();
  await page.waitForURL(/\/researchers$/);
  await expectSingleSidebarHighlight(page, "Researchers");

  await sidebarNav(page, "Audit log").click();
  await page.waitForURL(/\/activity$/);
  await expectSingleSidebarHighlight(page, "Audit log");

  await sidebarNav(page, "Analytics").click();
  await page.waitForURL(/\/analytics$/);
  await expectSingleSidebarHighlight(page, "Analytics");

  await sidebarNav(page, "Members").click();
  await page.waitForURL(/\/members$/);
  await expectSingleSidebarHighlight(page, "Members");

  // A specific member's own detail sub-route must keep "Members" highlighted -- the other
  // case (alongside the program sub-route above) the old tab row could never match. "Manage"
  // (MemberTable's own per-row action link) is unambiguous and exact, unlike the row's own
  // name/email cell link, which is a compound accessible name.
  await page.getByRole("link", { name: "Manage" }).first().click();
  await page.waitForURL(/\/members\/[0-9a-f-]{36}$/);
  await expectSingleSidebarHighlight(page, "Members");

  await page.goBack();
  await page.waitForURL(/\/members$/);
  await sidebarNav(page, "Settings").click();
  await page.waitForURL(/\/settings$/);
  await expectSingleSidebarHighlight(page, "Settings");

  await signOut(page);
});

test("org journey: researcher accepts an invitation, sees the finalized amount, and gets notified", async ({ page }) => {
  await signIn(page, INVITED_EMAIL);

  // --- Accept the (seeded) pending private-program invitation via the real accept flow --
  await page.goto("/settings/invitations");
  await expect(page.getByText(PRIVATE_PROGRAM_NAME)).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(PRIVATE_PROGRAM_NAME)).not.toBeVisible();

  // --- Now a participant, the private program is findable from the command menu's search (202610190001) --
  await page.keyboard.press("Control+k");
  await page.getByRole("searchbox", { name: "Global search" }).fill(PRIVATE_PROGRAM_NAME);
  await page.getByRole("searchbox", { name: "Global search" }).press("Enter");
  await page.waitForURL(/\/search\?q=/);
  await expect(page.getByRole("link", { name: new RegExp(PRIVATE_PROGRAM_NAME) })).toBeVisible();

  await signOut(page);

  // --- Veteran researcher: bell shows the new notification, sees the finalized amount ---
  await signIn(page, VETERAN_EMAIL);
  await page.goto("/notifications");
  // report.accepted and report.resolved on the triage-walk report both route to this
  // researcher (they submitted it) -- proves the Turn 8 handler pipeline end to end,
  // through the real outbox worker (playwright.config.ts's second webServer entry).
  await expect(page.getByText(/entered triage|report was accepted|report was resolved/).first()).toBeVisible();

  // The bell's accessible name includes the unread count when non-zero ("Notifications, N
  // unread") -- match either form.
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("group", { name: "Recent notifications" })).toBeVisible();
  await page.keyboard.press("Escape");

  // --- Researcher-visible finalized bounty amount ---------------------------------------
  await page.goto("/reports");
  await page.getByRole("link", { name: TRIAGE_WALK_REPORT_TITLE }).click();
  await expect(page.getByText(/USD 500\.00/).first()).toBeVisible(); // bounty + payment panels
  await expect(page.getByText("Unpatched sends the payout to the researcher.")).toBeVisible();

  // --- Researcher Reports: only real analytics (the sample "Preview" sections were removed) --
  await page.goto("/reports");
  await expect(page.getByText("Preview")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /E2E seed:/ }).first()).toBeVisible();

  await signOut(page);
});

test("visibility with teeth: an uninvited researcher cannot see the private program in any list or by direct URL", async ({ page }) => {
  // Real ids from the seed run (scripts/seed-e2e.ts writes this) -- a direct-URL attempt
  // against a GUESSED id would only prove "a nonexistent id is denied," which every route
  // already does trivially. Attempting the REAL private program's own id is what actually
  // exercises RLS/get_public_program's re-verification, not just UI list-filtering.
  const fixtureRaw = await readFile(path.join(process.cwd(), "e2e", ".seed-fixture.json"), "utf-8");
  const fixture = JSON.parse(fixtureRaw) as { organizationId: string; publicProgramId: string; privateProgramId: string };

  await signIn(page, NEWCOMER_EMAIL);

  // Not in the public discovery list -- /programs is the real public-programs list; the
  // private program's name must never appear there for anyone, and the public one (this
  // account has no participation in) still correctly appears (proves the list itself is
  // rendering real data, not silently empty).
  await page.goto("/programs");
  // .first(): it can appear in a featured section and the registry below it.
  await expect(page.getByText(PUBLIC_PROGRAM_NAME).first()).toBeVisible();
  await expect(page.getByText(PRIVATE_PROGRAM_NAME)).not.toBeVisible();

  // Not in this account's own organizations list -- the newcomer has no org membership.
  await page.goto("/organizations");
  await expect(page.getByText(ORG_NAME)).not.toBeVisible();

  // Direct URL to the PRIVATE program's real, seeded id (not a guess): the org-scoped
  // program detail route requires real access and must render the same PermissionDenied
  // state a nonexistent id would -- never the program's real name, status, or scope. This
  // is RLS/service-layer denial, not client-side hiding: the page still executes its own
  // real query against this account's own session and gets nothing back.
  await page.goto(`/organizations/${fixture.organizationId}/programs/${fixture.privateProgramId}`);
  await expect(page.getByText(PRIVATE_PROGRAM_NAME)).not.toBeVisible();
  await expect(page.getByText(/does not exist, or you do not have access/i)).toBeVisible();

  // The direct-URL public program, by contrast, DOES resolve -- confirms the private
  // program's denial above is a real, specific access decision, not every direct program
  // URL failing generically for this account.
  await page.goto(`/organizations/${fixture.organizationId}/programs/${fixture.publicProgramId}`);
  await expect(page.getByRole("heading", { name: PUBLIC_PROGRAM_NAME })).toBeVisible();

  // Direct URL to the organization itself: same denial shape.
  await page.goto(`/organizations/${fixture.organizationId}`);
  await expect(page.getByText(ORG_NAME)).not.toBeVisible();
  await expect(page.getByText(/do not have access/i)).toBeVisible();

  await signOut(page);
});
