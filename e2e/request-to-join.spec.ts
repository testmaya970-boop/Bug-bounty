import { test, expect, type Page } from "./qa-test";
import { readFileSync } from "node:fs";
import { passMfaGate } from "./mfa-gate";

// Request to join (202610220002): on a "by request" public program a researcher asks, the
// program's staff approve, and the researcher has access. Uses its own seeded program and
// researcher so it never changes what other specs see.

const PASSWORD = "E2ESeed!2026";
const REQUESTER = "e2e.requester@unpatched.demo";
const OWNER = "e2e.admin@unpatched.demo";

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("researcher asks to join a by-request program; the owner approves; the researcher has access", async ({ page }) => {
  const { organizationId, requestProgramId } = JSON.parse(readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; requestProgramId: string };
  const programPage = `/organizations/${organizationId}/programs/${requestProgramId}`;

  await signIn(page, REQUESTER);
  await page.goto(programPage);
  await expect(page.getByRole("button", { name: "Start researching" })).toHaveCount(0);
  await page.getByLabel("Why you'd like to join (optional)").fill("E2E: I focus on API authorization bugs.");
  await page.getByRole("button", { name: "Ask to join" }).click();
  await expect(page.getByRole("button", { name: "Withdraw request" })).toBeVisible();

  await signIn(page, OWNER);
  await page.goto(programPage);
  const requests = page.getByRole("region", { name: /Requests to join/ });
  await expect(requests).toContainText("E2E: I focus on API authorization bugs.");
  await requests.getByRole("button", { name: "Approve E2E Requester Researcher" }).click();
  await expect(page.getByRole("region", { name: /Requests to join/ })).toHaveCount(0);

  await signIn(page, REQUESTER);
  await page.goto(programPage);
  await expect(page.getByRole("button", { name: "Ask to join" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Report a vulnerability|Submit a report/ }).first()).toBeVisible();
});
