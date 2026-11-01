import { test, expect, type Page } from "./qa-test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { base32Decode, totpCode } from "../lib/auth/totp";

// Authenticator-app MFA end to end. The setup key is read off the screen and codes are
// computed with lib/auth/totp.ts (checked against the RFC 6238 vectors in
// tests/unit/totp.test.ts) -- so enrolling only succeeds if Postgres's private.totp_code
// agrees with it, exactly as a real Google Authenticator would have to.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const PASSWORD = "authenticator-test-password-2026";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

async function asRole<T>(claims: { sub: string; role: "service_role" | "authenticated" }, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify(claims)]);
    await client.query(`set local role ${claims.role}`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
const asServiceRole = <T>(fn: (client: pg.Client) => Promise<T>) => asRole({ sub: "", role: "service_role" }, fn);

async function signUpVerified(page: Page, email: string): Promise<string> {
  await page.goto("/researchers/sign-up");
  await page.getByLabel("Your name").fill(`Authenticator Tester ${Date.now()}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  const userId = await asServiceRole(async (db) => {
    const { rows } = await db.query<{ id: string }>("select id from public.users where email = $1", [email]);
    await db.query("update public.signup_verification_challenges set code_hash = $2 where user_id = $1 and consumed_at is null", [rows[0].id, sha256("246810")]);
    return rows[0].id;
  });
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !/sign-up|sign-in/.test(url.pathname));
  return userId;
}

const stepNow = () => Math.floor(Date.now() / 30_000);

test("set up an authenticator app, then sign in with its code (no email, no replay)", async ({ page, context }) => {
  const email = `e2e.totp-${Date.now().toString(36)}${randomBytes(2).toString("hex")}@unpatched.demo`;
  const userId = await signUpVerified(page, email);

  // Enroll: QR + setup key, confirmed with a code the "app" computes from that key.
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  const key = base32Decode((await page.getByTestId("totp-secret").innerText()).replace(/\s/g, ""));
  const enrollStep = stepNow();
  const enrollCode = totpCode(key, enrollStep);

  await page.getByLabel("6-digit code").fill(totpCode(key, enrollStep + 5)); // a code from the wrong time
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "didn't match" })).toBeVisible();

  await page.getByLabel("6-digit code").fill(enrollCode);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Save these backup codes")).toBeVisible();
  await page.getByRole("button", { name: "I've saved these codes" }).click();
  await expect(page.getByText("Authenticator app", { exact: true })).toBeVisible();

  // An authenticator account can never be sent an emailed code instead.
  await expect(
    asRole({ sub: userId, role: "authenticated" }, (db) => db.query("select public.create_mfa_challenge('verify', $1, 600)", [sha256("x")])),
  ).rejects.toThrow(/TOTP_METHOD/);

  // Sign in again: the gate asks for the authenticator code.
  await context.clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/mfa\/verify/);
  await expect(page.getByText("Enter the 6-digit code from your authenticator app.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a new code" })).toHaveCount(0);

  // The code already used to enroll is refused (replay); the next one works.
  await page.getByLabel("Verification code").fill(enrollCode);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "didn't match" })).toBeVisible();

  await page.getByLabel("Verification code").fill(totpCode(key, Math.max(stepNow(), enrollStep + 1)));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/mfa/verify") && !url.pathname.startsWith("/sign-in"));

  // The secret is stored encrypted, never as the plain key.
  const stored = await asServiceRole(async (db) => (await db.query("select totp_secret_encrypted from public.mfa_factors where user_id = $1", [userId])).rows[0]);
  expect(stored.totp_secret_encrypted.toString("hex")).not.toContain(key.toString("hex"));
});
