import { test, expect, type Page, type Browser } from "./qa-test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { passMfaGate } from "./mfa-gate";

// The researcher journey (202610280001) through the real UI: every researcher page opens, and the
// new workflows (collaboration consent, Hall of Fame consent, events, calendar, swag, agreements,
// follows) work end to end with the staff side that drives them.

const PASSWORD = "E2ESeed!2026";
const tag = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const fixture = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const match = new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error(`${name} not found`);
  return match[1].trim();
}

/** Runs SQL as a user through the same RLS and claims the app uses (or as the service role). */
async function as<T>(sub: string | null, fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({ connectionString: env("DATABASE_URL") });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.current_claims', $1, true)", [JSON.stringify(sub ? { sub, role: "authenticated" } : { sub: "", role: "service_role" })]);
    await db.query(`set local role ${sub ? "authenticated" : "service_role"}`);
    const result = await fn(db);
    await db.query("commit");
    return result;
  } finally {
    await db.end();
  }
}
const userByEmail = (email: string) => as(null, async (db) => (await db.query<{ id: string; username: string }>("select id, username from public.users where email = $1", [email])).rows[0]);

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

async function newSignedInPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  return page;
}

async function expectHealthyPage(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("This page hit an unexpected error.")).toHaveCount(0);
  await expect(page.locator("h1").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(1);
}

const RESEARCHER_PAGES = [
  "/", "/programs", "/reports", "/reports/drafts", "/researchers", "/recognition", "/ctf", "/learn", "/events", "/mentorship", "/hall-of-fame", "/bounties", "/bounties/documents",
  "/profile", "/settings", "/settings/profile", "/settings/security", "/settings/notifications", "/settings/skills", "/settings/external-services", "/settings/email-alias", "/settings/identity",
  "/settings/payments", "/settings/swag", "/settings/reputation", "/settings/calendar", "/settings/subscriptions", "/settings/collaboration", "/settings/invitations", "/settings/digital-agreements",
  "/settings/feedback", "/settings/report-templates", "/notifications",
];

test("every researcher page opens without errors or sideways scroll, desktop and phone", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, "e2e.veteran@unpatched.demo");
  for (const url of RESEARCHER_PAGES) await expectHealthyPage(page, url);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const url of ["/", "/recognition", "/events", "/mentorship", "/settings/collaboration", "/settings/swag", "/settings/calendar", "/settings/digital-agreements", "/settings/subscriptions", "/hall-of-fame"]) {
    await expectHealthyPage(page, url);
  }
  // The retired stub sends old links home instead of an empty page.
  await page.goto("/coming-soon");
  await expect(page).toHaveURL(/\/$/);
});

test("collaboration needs consent: the invitee accepts in settings and only then can open the report", async ({ page, browser }) => {
  const veteran = await userByEmail("e2e.veteran@unpatched.demo");
  const newcomer = await userByEmail("e2e.newcomer@unpatched.demo");
  await as(newcomer.id, (db) => db.query("select public.join_public_program($1)", [fixture.publicProgramId]).catch(() => null));
  const reportId = await as(veteran.id, async (db) => {
    await db.query("select set_config('app.acknowledged_policy_version', coalesce((select version_number::text from public.program_policy_versions where program_id = $1 and superseded_at is null), ''), true)", [fixture.publicProgramId]);
    const { rows } = await db.query("select id from public.submit_report($1, 'domain', 'api.e2e-public.example', $2, $3, 'sql_injection', 'Impact.', 'low')", [fixture.publicProgramId, `Collab journey ${tag}`, `Shared finding ${tag}: steps to reproduce it in full detail.`]);
    return rows[0].id as string;
  });
  const reportUrl = `/organizations/${fixture.organizationId}/programs/${fixture.publicProgramId}/reports/${reportId}`;

  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto(reportUrl);
  await page.getByLabel("Researcher's username").fill(newcomer.username);
  await page.getByLabel("Their share (%)").fill("100");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /share/i })).toBeVisible(); // 100% would leave the submitter nothing
  await page.getByLabel("Their share (%)").fill("25");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent.")).toBeVisible();

  const invitee = await newSignedInPage(browser, "e2e.newcomer@unpatched.demo");
  await invitee.goto(reportUrl);
  await expect(invitee.getByText(`Collab journey ${tag}`)).toHaveCount(0); // not readable before accepting
  await invitee.goto("/settings/collaboration");
  const row = invitee.getByRole("listitem").filter({ hasText: `Collab journey ${tag}` });
  await expect(row).toContainText("25%");
  await row.getByRole("button", { name: "Accept" }).click();
  await expect(invitee.getByRole("link", { name: `Collab journey ${tag}` })).toBeVisible();
  await invitee.getByRole("link", { name: `Collab journey ${tag}` }).click();
  await expect(invitee.getByRole("heading", { name: `Collab journey ${tag}` })).toBeVisible();
  await invitee.screenshot({ path: "test-results/researcher-journey/collaboration.png", fullPage: true });
});

test("Hall of Fame: the organization offers credit, the researcher agrees, the public page shows only a name", async ({ page, browser }) => {
  const veteran = await userByEmail("e2e.veteran@unpatched.demo");
  const report = await as(null, async (db) => (await db.query<{ id: string }>("select id from public.reports where researcher_id = $1 and status = 'resolved' and program_id = $2 limit 1", [veteran.id, fixture.publicProgramId])).rows[0]);
  // Start clean: a previous run may have left this report's acknowledgement in place.
  await as(null, (db) => db.query("delete from public.program_acknowledgements where report_id = $1", [report.id]).catch(() => null));

  const staff = await newSignedInPage(browser, "e2e.admin@unpatched.demo");
  await staff.goto(`/organizations/${fixture.organizationId}/programs/${fixture.publicProgramId}/reports/${report.id}`);
  await staff.getByLabel("Public thank-you message").fill(`Thanks ${tag}`);
  await staff.getByRole("button", { name: "Offer Hall of Fame credit" }).click();
  await expect(staff.getByText("Waiting for the researcher to agree.")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/hall-of-fame?program=${fixture.publicProgramId}`);
  await expect(visitor.getByText(`Thanks ${tag}`)).toHaveCount(0); // not public before consent

  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto("/recognition");
  const ack = page.getByRole("listitem").filter({ hasText: `Thanks ${tag}` });
  await ack.getByRole("button", { name: "Show my name" }).click();
  await expect(ack).toContainText("Public");

  await visitor.reload();
  await expect(visitor.getByText(`Thanks ${tag}`)).toBeVisible();
  await visitor.screenshot({ path: "test-results/researcher-journey/hall-of-fame.png", fullPage: true });

  await ack.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(ack).toContainText("Revoked");
  await visitor.reload();
  await expect(visitor.getByText(`Thanks ${tag}`)).toHaveCount(0);
});

test("events, calendar, swag, agreements and follows work end to end", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const admin = await newSignedInPage(browser, "e2e.platform-admin@unpatched.demo");
  const eventTitle = `E2E live hack ${tag}`;
  const local = (days: number) => new Date(Date.now() + days * 86_400_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  await admin.goto("/platform/events");
  await admin.getByLabel("Title").fill(eventTitle);
  await admin.getByLabel("Description").fill("A one-day internal live hacking event.");
  await admin.getByLabel("Starts").fill(local(3));
  await admin.getByLabel("Ends").fill(local(4));
  await admin.getByLabel("Registration closes").fill(local(2));
  await admin.getByLabel("Places").fill("5");
  await admin.getByRole("button", { name: "Create draft event" }).click();
  const eventRow = admin.getByRole("listitem").filter({ hasText: eventTitle });
  await eventRow.getByRole("button", { name: "Publish" }).click();
  await expect(eventRow).toContainText("Public");

  const itemName = `E2E sticker ${tag}`;
  await admin.goto("/platform/swag");
  await admin.getByLabel("Name").fill(itemName);
  await admin.getByLabel("Stock on hand").fill("1");
  await admin.getByLabel("Description").fill("A sticker with the seal.");
  await admin.getByRole("button", { name: "Add item" }).click();
  await expect(admin.getByText(itemName)).toBeVisible();

  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto("/events");
  const card = page.getByRole("listitem").filter({ hasText: eventTitle });
  await card.getByRole("button", { name: "Register" }).click();
  await expect(card).toContainText("Registered");
  await page.goto("/settings/calendar");
  await expect(page.getByRole("link", { name: eventTitle })).toBeVisible();
  // Fetched by the page itself: the session cookie is Secure, which Playwright's separate request
  // client won't send to the plain-http test server, but the browser does.
  const ics = await page.evaluate(async () => {
    const res = await fetch("/api/calendar");
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  });
  expect(ics.status).toBe(200);
  expect(ics.type).toContain("text/calendar");
  expect(ics.body).toContain(`SUMMARY:E2E live hack ${tag}`);

  await page.goto("/settings/swag");
  const item = page.getByRole("listitem").filter({ hasText: itemName });
  await item.getByLabel("Name for delivery").fill("Veteran Researcher");
  await item.getByLabel("Delivery address").fill("12 MG Road, Bengaluru 560001, India");
  await item.getByRole("button", { name: "Request" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: itemName }).filter({ hasText: "Requested" }).last()).toBeVisible();

  await admin.goto("/platform/swag");
  const req = admin.getByRole("listitem").filter({ hasText: itemName }).filter({ hasText: "12 MG Road" });
  await req.getByRole("button", { name: "Update" }).click();
  await expect(req).toContainText("Approved");
  await page.goto("/settings/swag");
  await expect(page.getByRole("listitem").filter({ hasText: itemName }).filter({ hasText: "Approved" }).last()).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: itemName }).first()).toContainText("0 left");

  await page.goto("/settings/digital-agreements");
  const accept = page.getByRole("button", { name: "I have read and accept this" });
  if (await accept.count()) await accept.click();
  await expect(page.getByText(/You accepted this text on/)).toBeVisible();

  await page.goto(`/organizations/${fixture.organizationId}/programs/${fixture.publicProgramId}`);
  const follow = page.getByRole("button", { name: /^Follow(ing)?$/ });
  if ((await follow.textContent())?.trim() === "Follow") await follow.click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();
  await page.goto("/settings/subscriptions");
  await expect(page.getByRole("link", { name: "E2E Public Program" })).toBeVisible();
  await page.screenshot({ path: "test-results/researcher-journey/subscriptions.png", fullPage: true });

  // Leave the shared fixture as found.
  await page.getByRole("listitem").filter({ hasText: "E2E Public Program" }).getByRole("button", { name: "Unfollow" }).click();
  await page.goto(`/events`);
  await page.getByRole("listitem").filter({ hasText: eventTitle }).getByRole("button", { name: "Cancel registration" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel registration" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: eventTitle }).getByRole("button", { name: "Register" })).toBeVisible();
});
