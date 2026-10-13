import { test, expect, type Page } from "@playwright/test";

// Form-level cases the journey specs don't reach: every settings form saves AND the saved
// value survives a reload (a real round trip, not optimistic UI), plus the failure paths.
// Runs as e2e.settings@, an account only this file uses; seed:e2e resets its password
// and display name, and every case here undoes what it creates. Tests in one file run in
// order on one worker, so the password case never races the others.

const PASSWORD = "E2ESeed!2026";
const EMAIL = "e2e.settings@unpatched.demo";
const PASSWORD_CASE_EMAIL = "e2e.password@unpatched.demo"; // its own sign-in rate-limit bucket
const stamp = () => Date.now().toString(36);

async function signIn(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}


test("profile: display name and biography save and survive a reload; no public username field", async ({ page }) => {
  await signIn(page);
  const bio = `Bio ${stamp()}`;
  await page.goto("/settings/profile");
  await expect(page.getByLabel("Public username")).toHaveCount(0);

  await page.getByLabel("Display name").fill("E2E Settings Renamed");
  await page.getByRole("button", { name: "Save" }).nth(0).click();
  await expect(page.getByText("Display name updated.")).toBeVisible();
  await page.getByLabel("Biography").fill(bio);
  await page.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(page.getByText("Biography updated.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("E2E Settings Renamed");
  await expect(page.getByLabel("Biography")).toHaveValue(bio);
});

test("api token: the page says coming soon, and a bearer token is not accepted yet", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/settings/api-tokens");
  await expect(page.getByRole("heading", { name: "Coming soon" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate token" })).toHaveCount(0);
  expect((await request.get("/api/v1/reports", { headers: { Authorization: "Bearer unpatched_pat_anything" } })).status()).toBe(401);
});

test("report templates: create, edit and delete", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/report-templates");
  const name = `Template ${stamp()}`;
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Template name").fill(name);
  await page.getByLabel("Description template").fill("## Steps\n1.");
  await page.getByRole("button", { name: "Save template" }).click();
  const row = page.locator("li", { hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Template name").fill(`${name} v2`);
  await page.getByRole("button", { name: "Save template" }).click();
  const edited = page.locator("li", { hasText: `${name} v2` });
  await expect(edited).toBeVisible(); // the save finished -- reloading before it raced it
  await page.reload();
  await expect(edited).toBeVisible();

  await edited.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("li", { hasText: name })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("li", { hasText: name })).toHaveCount(0);
});

test("feedback and notification preferences save for real", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/feedback");
  await page.getByLabel("Your feedback").fill(`Functional case ${stamp()}: the settings forms work.`);
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Sent. Thank you.")).toBeVisible();

  await page.goto("/settings/notifications");
  const toggle = page.getByRole("switch").first();
  const before = await toggle.getAttribute("aria-checked");
  const after = before === "true" ? "false" : "true";
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", after);
  await page.reload();
  await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", after);
  await page.getByRole("switch").first().click(); // put it back
  await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", before!);
});

test("password and email changes demand the current password; a changed password is the only one that works", async ({ page, browser }) => {
  await signIn(page, PASSWORD_CASE_EMAIL);
  await page.goto("/settings/password");
  const passwordForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Update password" }) });
  const emailForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Change email" }) });

  // A live session alone cannot change the email.
  await emailForm.getByLabel("New email").fill(`taken-over-${stamp()}@example.com`);
  await emailForm.getByRole("textbox", { name: "Current password" }).fill("not-my-password");
  await emailForm.getByRole("button", { name: "Change email" }).click();
  await expect(emailForm.getByRole("alert")).toHaveText("Your current password is not correct.");

  // ...nor the password.
  const next = `Rotated-${stamp()}-Passphrase`;
  await passwordForm.getByRole("textbox", { name: "Current password" }).fill("not-my-password");
  await passwordForm.getByRole("textbox", { name: "New password", exact: true }).fill(next);
  await passwordForm.getByRole("textbox", { name: "Confirm new password" }).fill(next);
  await passwordForm.getByRole("button", { name: "Update password" }).click();
  await expect(passwordForm.getByRole("alert")).toHaveText("Your current password is not correct.");

  await passwordForm.getByRole("textbox", { name: "Current password" }).fill(PASSWORD);
  await passwordForm.getByRole("textbox", { name: "New password", exact: true }).fill("short");
  await passwordForm.getByRole("textbox", { name: "Confirm new password" }).fill("short");
  await passwordForm.getByRole("button", { name: "Update password" }).click();
  await expect(passwordForm.getByRole("alert")).toContainText("12 characters");

  // A mistyped confirmation is refused before the server is asked.
  await passwordForm.getByRole("textbox", { name: "New password", exact: true }).fill(next);
  await passwordForm.getByRole("textbox", { name: "Confirm new password" }).fill(`${next}x`);
  await passwordForm.getByRole("button", { name: "Update password" }).click();
  await expect(passwordForm.getByRole("alert")).toHaveText("Passwords don't match."); // under the field, once

  await passwordForm.getByRole("textbox", { name: "Confirm new password" }).fill(next);
  await passwordForm.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  const fresh = await browser.newPage();
  await fresh.goto("/sign-in");
  await fresh.getByLabel("Email").fill(PASSWORD_CASE_EMAIL);
  await fresh.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await fresh.getByRole("button", { name: "Sign in" }).click();
  await expect(fresh.getByRole("alert").first()).toBeVisible();
  await expect(fresh).toHaveURL(/\/sign-in/);
  await signIn(fresh, PASSWORD_CASE_EMAIL, next);
  await fresh.close();

  // Put the seed password back through the same form.
  await passwordForm.getByRole("textbox", { name: "Current password" }).fill(next);
  await passwordForm.getByRole("textbox", { name: "New password", exact: true }).fill(PASSWORD);
  await passwordForm.getByRole("textbox", { name: "Confirm new password" }).fill(PASSWORD);
  await passwordForm.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();
});

test("auth failure paths: wrong password, unknown email on reset, weak sign-up password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.newcomer@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${stamp()}@example.com`);
  await page.getByRole("button", { name: /reset|send/i }).click();
  await expect(page.getByText("Check your email")).toBeVisible(); // same answer as a real account: no enumeration

  await page.goto("/researchers/sign-up");
  await page.getByLabel("Email").fill(`weak-${stamp()}@example.com`);
  await page.getByRole("textbox", { name: "Password" }).first().fill("short");
  await page.getByRole("button", { name: /create|sign up/i }).click();
  await expect(page).toHaveURL(/sign-up/);
  await expect(page.getByText(/12 characters/).first()).toBeVisible();
});

// Organization side, E2E Journey Org (ids from seed:e2e's fixture).
const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

test("program manager edits scope on the live program: add, edit, flip state, remove", async ({ page }) => {
  const { organizationId, publicProgramId } = await fixture();
  await signIn(page, "e2e.program-manager@unpatched.demo");
  await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
  const target = `case-${stamp()}.e2e.example.com`;

  await page.getByRole("button", { name: "Add scope" }).click();
  const add = page.getByRole("dialog", { name: "Add scope entry" });
  await add.getByRole("button", { name: "Add scope entry" }).click();
  await expect(add).toBeVisible(); // empty target is refused, dialog stays open
  await add.getByRole("textbox", { name: /^Target/ }).fill(target);
  await add.getByRole("button", { name: "Add scope entry" }).click();
  await expect(add).not.toBeVisible();

  const card = page.getByText(target, { exact: true }).locator("xpath=ancestor::*[.//button[normalize-space()='Remove']][1]");
  await card.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit scope entry" });
  await edit.getByLabel("Description").fill("Edited by the functional cases");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).not.toBeVisible();
  await page.reload();
  await expect(card.getByText("Edited by the functional cases")).toBeVisible();

  await card.getByRole("button", { name: "Mark out of scope" }).click();
  await page.getByRole("dialog", { name: "Change scope decision?" }).getByRole("button", { name: "Confirm change" }).click();
  await expect(card.getByRole("button", { name: "Mark in scope" })).toBeVisible();

  await card.getByRole("button", { name: "Remove" }).click();
  const remove = page.getByRole("dialog", { name: "Remove scope entry?" });
  await remove.getByRole("button", { name: "Remove scope entry" }).click();
  // Wait for the action to finish before reloading (as the edit step does); reloading
  // straight away raced the server action and showed the entry that was then removed.
  await expect(remove).not.toBeVisible();
  await page.reload();
  await expect(page.getByText(target, { exact: true })).toHaveCount(0);
});

test("owner: organization description saves and survives a reload", async ({ page }) => {
  const { organizationId } = await fixture();
  await signIn(page, "e2e.admin@unpatched.demo");
  await page.goto(`/organizations/${organizationId}/settings`);
  const field = page.getByLabel("Description");
  const original = await field.inputValue();
  const text = `Functional case ${stamp()}`;
  await field.fill(text);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Description updated.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue(text);
  await page.getByLabel("Description").fill(original);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Description updated.")).toBeVisible();
});

test("billing admin pays a bounty end to end: initiate, record success, ledger shows Paid", async ({ page }) => {
  const { organizationId } = await fixture();
  await signIn(page, "e2e.billing-admin@unpatched.demo");
  await page.goto(`/organizations/${organizationId}/payments`);
  const row = page.getByRole("row").filter({ hasText: "E2E seed: resolved report with finalized bounty" });
  await expect(row.getByText("Pending")).toBeVisible(); // seed:e2e recreates it every run

  await row.getByRole("button", { name: "Initiate manual payout" }).click();
  const confirm = page.getByRole("dialog", { name: "Initiate a manual payout?" });
  await expect(confirm.getByText("USD 1500.00")).toBeVisible(); // researcher gets the full bounty; the fee is billed separately
  await confirm.getByRole("button", { name: "Initiate payout" }).click();
  await expect(row.getByText("Processing")).toBeVisible();

  await row.getByRole("button", { name: "Record payout result" }).click();
  const record = page.getByRole("dialog", { name: "Record the outcome of this payout attempt" });
  await record.getByLabel("Outcome").selectOption("succeeded");
  await record.getByLabel("Transfer reference").fill("WIRE-E2E-001");
  await record.getByRole("button", { name: "Continue" }).click();
  await record.getByRole("button", { name: "Confirm" }).click();
  await expect(row.getByText("Paid")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "E2E seed: resolved report with finalized bounty" }).getByText("Paid")).toBeVisible();
  await expect(page.getByText("USD 1500.00").first()).toBeVisible(); // "Paid to researchers" total
});

test("ctf: an empty or wrong flag is refused with a clear message", async ({ page }) => {
  await signIn(page);
  await page.goto("/ctf");
  await page.locator('a[href^="/ctf/"]').first().click();
  await page.waitForURL(/\/ctf\/[^/?]+$/);
  await page.getByRole("button", { name: "Submit flag" }).click();
  await expect(page).toHaveURL(/\/ctf\/[^/?]+$/); // required field: nothing submitted
  await page.getByLabel("Flag").fill("flag{definitely_not_it}");
  await page.getByRole("button", { name: "Submit flag" }).click();
  await expect(page.getByText("Incorrect flag. Try again.")).toBeVisible();
});

test("timestamps show the viewer's local time, and the server renders it too once the zone is known", async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: "Asia/Kolkata" });
  const page = await context.newPage();
  await signIn(page, "e2e.veteran@unpatched.demo");
  await page.goto("/notifications");
  const time = page.locator("main time[datetime]").first();
  await expect(time).toBeVisible();
  const iso = (await time.getAttribute("datetime"))!;
  const local = new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  await expect(time).toHaveText(local); // not the unlabelled UTC the notifications showed before
  await expect(time).toHaveAttribute("title", /UTC$/);

  // The browser has reported its zone (tz cookie): the server's own HTML is now local
  // time, so there is no flash of UTC on the next page load.
  // (A real navigation: its document response is exactly the server's HTML, sent with the
  // browser's own cookies.)
  const response = await page.goto("/notifications");
  expect(await response!.text()).toContain(local);
  await context.close();
});
