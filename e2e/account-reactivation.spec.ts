import { test, expect, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Deactivate -> clear message + no reset -> a platform admin reactivates -> sign in again.
// And an account a platform admin DELETED can't be brought back this way.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const PASSWORD = "Reactivation-test-2026!";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

async function asServiceRole<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: "", role: "service_role" })]);
    await client.query("set local role service_role");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } finally {
    await client.end();
  }
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signUpVerified(page: Page, email: string): Promise<string> {
  await page.goto("/researchers/sign-up");
  await page.getByLabel("Your name").fill("Reactivation Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  const confirm = page.getByRole("textbox", { name: "Confirm password" });
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  const userId = await asServiceRole(async (db) => {
    const { rows } = await db.query<{ id: string }>("select id from public.users where email = $1", [email]);
    await db.query("update public.signup_verification_challenges set code_hash = $2 where user_id = $1 and consumed_at is null", [rows[0].id, sha256("246810")]);
    return rows[0].id;
  });
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL((url) => !/sign-up|sign-in/.test(url.pathname));
  return userId;
}

async function deactivateSelf(page: Page) {
  await page.goto("/settings/deactivate");
  await page.getByLabel("Type DEACTIVATE to confirm").fill("DEACTIVATE");
  await page.getByRole("button", { name: "Deactivate my account" }).click();
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/settings"));
}

async function reactivateAsAdmin(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, "e2e.platform-admin@unpatched.demo", "E2ESeed!2026");
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/platform/researchers");
  await page.getByRole("combobox", { name: "Deactivated account" }).fill(email);
  await page.getByRole("option").filter({ hasText: email }).click();
  await page.getByLabel("Explain why this account is being reactivated").fill("E2E: user asked to come back");
  await page.getByRole("button", { name: "Reactivate" }).click();
}

const freshEmail = (tag: string) => `e2e.reactivate-${tag}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}@unpatched.demo`;

test("a deactivated account is told so, gets no reset link, and signs in again once an admin reactivates it", async ({ page }) => {
  const email = freshEmail("ok");
  const userId = await signUpVerified(page, email);
  await deactivateSelf(page);

  await page.context().clearCookies();
  await signIn(page, email, PASSWORD);
  await expect(page.getByText("This account has been deactivated. Contact support to reactivate it.")).toBeVisible();
  await signIn(page, email, "Wrong-password-2026!");
  await expect(page.getByText("Incorrect email or password.")).toBeVisible(); // wrong password: still generic

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /reset|send/i }).click();
  await expect(page.getByText("Check your email")).toBeVisible(); // same neutral screen...
  const tokens = await asServiceRole(async (db) => (await db.query("select count(*)::int n from public.password_reset_tokens where user_id = $1", [userId])).rows[0].n);
  expect(tokens).toBe(0); // ...but no reset link was issued

  await reactivateAsAdmin(page, email);
  await expect(page.getByText(`${email} can sign in again.`)).toBeVisible();
  const audit = await asServiceRole(async (db) => (await db.query("select count(*)::int n from public.audit_logs where action = 'platform.account_reactivated' and entity_id = $1", [userId])).rows[0].n);
  expect(audit).toBe(1);

  await page.context().clearCookies();
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
});

test("an account deleted by a platform admin can't be reactivated", async ({ page }) => {
  const email = freshEmail("deleted");
  const userId = await signUpVerified(page, email);
  await deactivateSelf(page);
  // What delete_researcher_platform_wide leaves behind (deactivated + this audit entry).
  await asServiceRole((db) => db.query("insert into public.audit_logs (actor_id, organization_id, action, entity_type, entity_id, metadata) values (null, null, 'platform.researcher_deleted', 'user', $1, '{}')", [userId]));

  // The admin search doesn't even offer it...
  await page.context().clearCookies();
  await signIn(page, "e2e.platform-admin@unpatched.demo", "E2ESeed!2026");
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/platform/researchers");
  await page.getByRole("combobox", { name: "Deactivated account" }).fill(email);
  await expect(page.getByText(/No deactivated researcher matches/)).toBeVisible();

  // ...and the database refuses it even if asked directly, as a platform admin.
  const adminId = await asServiceRole(async (db) => (await db.query("select id from public.users where email = 'e2e.platform-admin@unpatched.demo'")).rows[0].id);
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ sub: adminId, role: "authenticated" })]);
    await client.query("set local role authenticated");
    await expect(client.query("select public.reactivate_account_platform_wide($1, 'try')", [email])).rejects.toThrow(/ACCOUNT_DELETED/);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
  const still = await asServiceRole(async (db) => (await db.query("select deactivated_at from public.users where id = $1", [userId])).rows[0].deactivated_at);
  expect(still).not.toBeNull();
});

test("admin finds a researcher by part of their email, suspends, then deletes them from the dropdown", async ({ page }) => {
  const email = freshEmail("search");
  await signUpVerified(page, email);

  await page.context().clearCookies();
  await signIn(page, "e2e.platform-admin@unpatched.demo", "E2ESeed!2026");
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/platform/researchers");

  const suspendForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Suspend" }) });
  const fragment = email.split("@")[0].slice(-10); // a piece of the address, not the whole thing
  await suspendForm.getByRole("combobox", { name: "Researcher" }).fill(fragment);
  const option = suspendForm.getByRole("option").filter({ hasText: email });
  await expect(option).toContainText("Active");
  await suspendForm.getByRole("combobox", { name: "Researcher" }).press("ArrowDown");
  await option.click();
  await expect(suspendForm.getByText(email)).toBeVisible(); // selected account shown
  await suspendForm.getByLabel("Explain why this account is being suspended").fill("E2E: search suspend");
  await suspendForm.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText(email).first()).toBeVisible(); // now listed under Currently suspended

  // Nothing matches: a helpful message, not a blank list.
  await suspendForm.getByRole("combobox", { name: "Researcher" }).fill("zz-no-such-researcher-zz");
  await expect(suspendForm.getByText(/No researcher matches/)).toBeVisible();

  const deleteForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Delete account" }) });
  await deleteForm.getByRole("combobox", { name: "Researcher" }).fill(fragment);
  await expect(deleteForm.getByRole("option").filter({ hasText: email })).toContainText("Suspended");
  await deleteForm.getByRole("option").filter({ hasText: email }).click();
  await deleteForm.getByLabel("Explain why this account is being deleted").fill("E2E: search delete");
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain(email); // the confirm names exactly who is deleted
    void dialog.accept();
  });
  await deleteForm.getByRole("button", { name: "Delete account" }).click();
  await expect(deleteForm.getByRole("combobox", { name: "Researcher" })).toBeVisible(); // form reset

  // Deleted accounts drop out of search.
  await deleteForm.getByRole("combobox", { name: "Researcher" }).fill(fragment);
  await expect(deleteForm.getByText(/No researcher matches/)).toBeVisible();
});
