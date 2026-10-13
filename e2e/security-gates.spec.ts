import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import pg from "pg";

// Launch gates added 2026-10-10 (db/migrations/202610100001): platform admins need MFA,
// failed sign-ins count toward the limit, and password reset is rate-limited.

const PASSWORD = "security-gates-password-2026";
const tag = () => `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = /^DATABASE_URL=(.+)$/m.exec(readFileSync(path.join(process.cwd(), ".env.local"), "utf-8"));
  if (!match) throw new Error("DATABASE_URL not found");
  return match[1].trim();
}

async function asRole<T>(claims: Record<string, string>, role: "service_role" | "authenticated", fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_claims', $1, true)", [JSON.stringify({ ...claims, role })]);
    await client.query(`set local role ${role}`);
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
const asServiceRole = <T>(fn: (client: pg.Client) => Promise<T>) => asRole({ sub: "" }, "service_role", fn);

test("a platform admin without MFA is sent to set it up and gets no admin pages", async ({ page }) => {
  const email = `e2e.gate-admin-${tag()}@example.com`;
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const userId = await asServiceRole(async (db) => {
    const { rows } = await db.query("select id from public.create_user($1, $2, 'Gate Admin', null)", [email, hash]);
    await db.query("update public.users set email_verified_at = now() where id = $1", [rows[0].id]);
    await db.query("insert into public.platform_admins (user_id) values ($1)", [rows[0].id]);
    return rows[0].id as string;
  });
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings\/security\?mfa=required/);
    await expect(page.getByText("Platform administrators must turn on two-factor authentication.")).toBeVisible();
    // The sidebar offers only the setup step, not a researcher nav that would just bounce back here.
    const nav = page.getByRole("navigation", { name: "Primary navigation" }).first();
    await expect(nav.getByRole("link", { name: "Set up two-factor" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

    await page.goto("/platform/organizations");
    await expect(page).toHaveURL(/\/settings\/security\?mfa=required/);
  } finally {
    await asServiceRole((db) => db.query("delete from public.users where id = $1", [userId]));
  }
});

test("admin power in the database follows the session's MFA, not just the account", async () => {
  const adminId = await asServiceRole(async (db) => (await db.query("select id from public.users where email = 'e2e.platform-admin@unpatched.demo'")).rows[0].id as string);
  const sessionId = randomUUID();
  await asServiceRole((db) => db.query("insert into public.sessions (id, user_id, token_hash, aal) values ($1, $2, $3, 'aal1')", [sessionId, adminId, `gate-${sessionId}`]));
  const amAdmin = (claims: Record<string, string>) =>
    asRole({ sub: adminId, ...claims }, "authenticated", async (db) => (await db.query("select public.am_i_platform_admin() as ok")).rows[0].ok as boolean);
  try {
    expect(await amAdmin({})).toBe(false); // no session at all
    expect(await amAdmin({ session_id: sessionId })).toBe(false); // password only
    await asServiceRole((db) => db.query("update public.sessions set aal = 'aal2' where id = $1", [sessionId]));
    expect(await amAdmin({ session_id: sessionId })).toBe(true); // passed MFA
    expect(await asRole({ sub: randomUUID(), session_id: sessionId }, "authenticated", async (db) => (await db.query("select public.am_i_platform_admin() as ok")).rows[0].ok)).toBe(false); // someone else's session
  } finally {
    await asServiceRole((db) => db.query("delete from public.sessions where id = $1", [sessionId]));
  }
});

test("wrong passwords count toward the sign-in limit", async ({ page }) => {
  const email = `e2e.gate-signin-${tag()}@example.com`;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  // Each attempt waits for its own server round trip, so all ten really reach the limiter.
  const attempt = async (password: string) => {
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/sign-in"), page.getByRole("button", { name: "Sign in" }).click()]);
  };
  for (let n = 1; n <= 10; n++) {
    await attempt(`wrong-password-${n}`);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  await attempt("wrong-password-11");
  await expect(page.getByText("Too many sign-in attempts. Wait a moment and try again.")).toBeVisible();
});

test("password reset requests are limited per email", async ({ page }) => {
  const email = `e2e.gate-reset-${tag()}@example.com`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
  }
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Too many reset requests. Try again in an hour.")).toBeVisible();
});
