import { test, expect, type Page } from "../qa-test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Auth flows driven as a phone (playwright.config.ts's android/iphone projects). The
// emailed code and reset token are never readable back (only hashes are stored), so each
// test plants a known code/token hash in the DB in place of reading the inbox -- everything
// else is the real UI on a phone viewport. Every test uses its own fresh account.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const freshEmail = (tag: string) => `e2e.phone-${tag}-${Date.now().toString(36)}${randomBytes(2).toString("hex")}@unpatched.demo`;
const FIRST_PASSWORD = "phone-first-password-2026";
const SECOND_PASSWORD = "phone-second-password-2026";

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

/** Replaces the live (unconsumed) signup code's hash so the test knows the code. */
async function plantSignupCode(email: string, code: string) {
  const { rowCount } = await asServiceRole((db) =>
    db.query(
      `update public.signup_verification_challenges c set code_hash = $2
       from public.users u where u.id = c.user_id and u.email = $1 and c.consumed_at is null`,
      [email, sha256(code)],
    ),
  );
  expect(rowCount, "a live signup code exists for this email").toBe(1);
}

async function signUp(page: Page, intent: "researcher" | "organization", email: string, password: string) {
  await page.goto(intent === "organization" ? "/organizations/sign-up" : "/researchers/sign-up");
  if (intent === "organization") await page.getByLabel("Organization name").fill("Phone Test Org");
  else await page.getByLabel("Your name").fill(`Phone Tester ${Date.now()}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Create account" }).tap();
  await expect(page.getByLabel("Verification code")).toBeVisible();
}

async function enterCode(page: Page, email: string) {
  await plantSignupCode(email, "246810");
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify" }).tap();
  // Poll where the page ends up, not one navigation event: WebKit sometimes reports the
  // hard navigation as "interrupted" by a follow-up redirect even though it lands fine.
  await expect(page).toHaveURL((url) => !/sign-up|sign-in/.test(url.pathname));
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).tap();
}

test("an abandoned signup can sign up again on the phone instead of 'account already exists'", async ({ page, context }) => {
  const email = freshEmail("retry");
  await signUp(page, "organization", email, FIRST_PASSWORD);

  // Walk away without entering the code, then come back and sign up again.
  await context.clearCookies();
  await signUp(page, "organization", email, SECOND_PASSWORD);
  await expect(page.getByText(/already exists/i)).toHaveCount(0);
  await enterCode(page, email);
  await expect(page).toHaveURL(/\/organizations/); // still an organization account

  // The password from the latest attempt is the one that works.
  await context.clearCookies();
  await signIn(page, email, FIRST_PASSWORD);
  await expect(page.getByRole("alert").first()).toBeVisible();
  await signIn(page, email, SECOND_PASSWORD);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
});

test("resending the code on the phone keeps the organization signup", async ({ page }) => {
  const email = freshEmail("resend");
  await signUp(page, "organization", email, FIRST_PASSWORD);
  await page.getByRole("button", { name: /^Resend code/ }).tap({ timeout: 90_000 });
  await expect(page.getByText("Sent again. Check your email.")).toBeVisible();
  await enterCode(page, email);
  await expect(page).toHaveURL(/\/organizations/);
});

test("an unconfirmed account can enter the resent code straight from the sign-in page", async ({ page, context }) => {
  const email = freshEmail("signin-code");
  await signUp(page, "researcher", email, FIRST_PASSWORD);
  await context.clearCookies();

  await signIn(page, email, FIRST_PASSWORD);
  await expect(page.getByText("Confirm your email address before signing in.")).toBeVisible();
  await page.getByRole("button", { name: "Resend confirmation email" }).tap();
  await expect(page.getByLabel("Verification code")).toBeVisible(); // was: "Sent." and no field
  await enterCode(page, email);
});

test("resetting the password of a never-confirmed account lets it sign in (no dead-end 'confirm your email')", async ({ page, context }) => {
  const email = freshEmail("reset-unconfirmed");
  await signUp(page, "researcher", email, FIRST_PASSWORD);
  await context.clearCookies();

  const token = randomBytes(32).toString("base64url");
  await asServiceRole((db) =>
    db.query(
      `insert into public.password_reset_tokens (user_id, token_hash, expires_at)
       select id, $2, now() + interval '1 hour' from public.users where email = $1`,
      [email, sha256(token)],
    ),
  );
  await page.goto(`/auth/confirm?type=recovery&token=${encodeURIComponent(token)}`);
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(SECOND_PASSWORD);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(SECOND_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).tap();
  await page.waitForURL(/\/sign-in\?reset=success/);

  await signIn(page, email, SECOND_PASSWORD);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
});

test("password reset from the emailed link works end to end on the phone", async ({ page, context, baseURL }) => {
  const email = freshEmail("reset");
  await signUp(page, "researcher", email, FIRST_PASSWORD);
  await enterCode(page, email);
  await context.clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /reset|send/i }).tap();
  await expect(page.getByText("Check your email")).toBeVisible();

  // The link exactly as the email builds it (services/auth.ts requestPasswordReset).
  const token = randomBytes(32).toString("base64url");
  await asServiceRole((db) =>
    db.query(
      `insert into public.password_reset_tokens (user_id, token_hash, expires_at)
       select id, $2, now() + interval '1 hour' from public.users where email = $1`,
      [email, sha256(token)],
    ),
  );
  await page.goto(`/auth/confirm?type=recovery&token=${encodeURIComponent(token)}`);

  // Redirected to the app's own origin, never to a localhost the phone can't reach.
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  // The page names the account -- also the username a password manager saves against.
  await expect(page.getByRole("textbox", { name: "Account" })).toHaveValue(email);

  // A typo in the confirmation is caught before anything is submitted.
  await page.getByRole("textbox", { name: "New password", exact: true }).fill(SECOND_PASSWORD);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(`${SECOND_PASSWORD}x`);
  await page.getByRole("button", { name: "Update password" }).tap();
  await expect(page.getByText("Passwords don't match.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password\?token=/);

  await page.getByRole("textbox", { name: "Confirm new password" }).fill(SECOND_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).tap();
  await page.waitForURL(/\/sign-in\?reset=success/);

  // The old password stops working; the new one signs in to a signed-in-only page.
  await signIn(page, email, FIRST_PASSWORD);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await signIn(page, email, SECOND_PASSWORD);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/settings/password");
  await expect(page).toHaveURL(/\/settings\/password/);

  // The link is single-use.
  await context.clearCookies();
  await page.goto(`/auth/confirm?type=recovery&token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/error=confirmation_failed/);
});
