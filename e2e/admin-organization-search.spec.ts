import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// Platform admin finds an organization by part of its name in the suspend form's search
// dropdown, suspends it, then reinstates it. Uses a fresh organization of its own.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const PASSWORD = "Org-search-test-2026!";

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

test("admin finds an organization by part of its name, suspends it, then reinstates it", async ({ page }) => {
  const tag = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
  const orgName = `Searchable Org ${tag}`;
  const email = `e2e.orgsearch-${tag}@unpatched.demo`;

  // A fresh organization account (organization sign-up creates the organization on verify).
  await page.goto("/organizations/sign-up");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  const confirm = page.getByRole("textbox", { name: "Confirm password" });
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await asServiceRole((db) =>
    db.query(
      "update public.signup_verification_challenges c set code_hash = $2 from public.users u where u.id = c.user_id and u.email = $1 and c.consumed_at is null",
      [email, sha256("246810")],
    ),
  );
  await page.getByLabel("Verification code").fill("246810");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/organizations\//);

  // Admin: search, pick, suspend.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.platform-admin@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto("/platform/organizations");

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Suspend" }) });
  const search = form.getByRole("combobox", { name: "Organization" });
  await search.fill(tag); // part of the name
  const option = form.getByRole("option").filter({ hasText: orgName });
  await expect(option).toContainText("Active");
  await expect(option).toContainText(email); // the owner, to tell look-alikes apart
  await search.press("ArrowDown");
  await search.press("Enter"); // keyboard pick
  await expect(form.getByText(orgName)).toBeVisible();
  await form.getByLabel("Explain why this organization is being suspended").fill("E2E: org search suspend");
  await form.getByRole("button", { name: "Suspend" }).click();

  // Listed under Currently suspended, and the search now shows it as Suspended.
  const row = page.locator("li.p-4").filter({ hasText: orgName }); // the Currently suspended row, not a dropdown option
  await expect(row).toBeVisible();
  await form.getByRole("combobox", { name: "Organization" }).fill(tag);
  await expect(form.getByRole("option").filter({ hasText: orgName })).toContainText("Suspended");

  // No match: a helpful message.
  await form.getByRole("combobox", { name: "Organization" }).fill("zz-no-such-org-zz");
  await expect(form.getByText(/No organization matches/)).toBeVisible();

  // Clean up: reinstate.
  await row.getByLabel("Explain the reinstatement").fill("E2E: cleanup");
  await row.getByRole("button", { name: /Reinstate/ }).click();
  await expect(row.getByText("Reinstated.")).toBeVisible();
});
