import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { passMfaGate } from "./mfa-gate";

// CVSS 4.0 scoring and asset tiers (202610220006) through the real UI.

const PASSWORD = "E2ESeed!2026";
const OWNER = "e2e.admin@unpatched.demo";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
}

function envUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  return /^MIGRATION_DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim() ?? /^DATABASE_URL=(.*)$/m.exec(env)![1].trim();
}

test("owner scores a report with CVSS 4.0 and sets an asset's tier", async ({ page }) => {
  const { organizationId } = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string };
  const db = new pg.Client({ connectionString: envUrl() });
  await db.connect();
  const report = (
    await db.query<{ id: string; program_id: string }>(
      "select r.id, r.program_id from public.reports r where r.organization_id = $1 and r.status in ('new', 'triaging', 'accepted') and not exists (select 1 from public.report_bounty_decisions d where d.report_id = r.id and d.state = 'finalized') order by r.submitted_at limit 1",
      [organizationId],
    )
  ).rows[0];
  await db.query("update public.reports set cvss4_vector = null, cvss4_score = null where id = $1", [report.id]);
  await db.end();

  await signIn(page, OWNER);
  await page.goto(`/organizations/${organizationId}/programs/${report.program_id}/reports/${report.id}`);
  await page.getByRole("button", { name: "Score with CVSS 4.0" }).click();
  const v4 = page.getByRole("group", { name: "CVSS 4.0 base metrics" });
  for (const [label, value] of [
    ["Attack vector", "N"], ["Attack complexity", "L"], ["Attack requirements", "N"], ["Privileges required", "N"], ["User interaction", "N"],
    ["Confidentiality (vulnerable system)", "H"], ["Integrity (vulnerable system)", "H"], ["Availability (vulnerable system)", "H"],
    ["Confidentiality (subsequent systems)", "N"], ["Integrity (subsequent systems)", "N"], ["Availability (subsequent systems)", "N"],
  ]) {
    await v4.getByLabel(label, { exact: true }).selectOption(value);
  }
  await expect(v4).toContainText("Score 9.3");
  await v4.getByRole("button", { name: "Save CVSS 4.0" }).click();
  await expect(page.getByText("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBeVisible();

  await page.goto(`/organizations/${organizationId}/assets`);
  const tierSelect = page.getByLabel(/^Tier for /).first();
  await tierSelect.selectOption("2");
  await page.reload();
  await expect(page.getByLabel(/^Tier for /).first()).toHaveValue("2");
  await page.getByLabel(/^Tier for /).first().selectOption("1"); // leave the seed as it was
});
