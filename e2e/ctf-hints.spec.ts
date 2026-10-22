import { test, expect, type Page } from "./qa-test";
import { ctfFlag } from "../lib/ctf-flags";

// Hints, write-ups and track badges (202610220010) in a real browser. Runs as e2e.settings@,
// whose CTF progress persists between runs: each step accepts the already-done state (hint
// taken, challenge solved, write-up published) so the spec is re-runnable.

const EMAIL = "e2e.settings@unpatched.demo";
const PASSWORD = "E2ESeed!2026";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function solveIfOpen(page: Page, flag: string) {
  const field = page.getByLabel("Flag");
  if (await field.isVisible().catch(() => false)) {
    await field.fill(flag);
    await page.getByRole("button", { name: "Submit flag" }).click();
    await expect(page.getByText(/^\+\d+ points$/)).toBeVisible({ timeout: 20000 });
  }
  await expect(page.getByText("Solved", { exact: true }).first()).toBeVisible({ timeout: 20000 });
}

test("CTF: take a paid hint, solve, read the write-up, publish one, earn the track badge", async ({ page }) => {
  await signIn(page);
  await page.goto("/ctf/rotten-cipher");

  // Hint 1 text is not in the page until it is taken; its cost is shown up front.
  const hint1Text = "Only letters moved.";
  const reveal = page.getByRole("button", { name: "Reveal hint 1" });
  if (await reveal.isVisible().catch(() => false)) {
    await expect(page.getByText(hint1Text)).toHaveCount(0);
    await expect(page.getByText("costs 10 pts")).toBeVisible();
    await reveal.click();
    await expect(page.getByText(/Reveal hint 1 for 10 pts\?/)).toBeVisible();
    await page.getByRole("button", { name: "Reveal for 10 pts" }).click();
  }
  await expect(page.getByText(hint1Text, { exact: false })).toBeVisible();
  await expect(page.getByText("Cost 10 pts")).toBeVisible();

  // Write-ups stay locked until the solve.
  const solvedAlready = !(await page.getByLabel("Flag").isVisible().catch(() => false));
  if (!solvedAlready) {
    await expect(page.getByText(/unlock when you solve this challenge/)).toBeVisible();
    await expect(page.getByText("Solve value 90 of 100 pts")).toBeVisible();
  }
  await solveIfOpen(page, ctfFlag("c-crypto-1"));

  // The official write-up appears after the solve.
  await expect(page.getByText("Official write-up")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Caesar cipher shifts every letter/)).toBeVisible();

  // Publish a solver write-up (or find the one a previous run published).
  const yours = page.getByRole("article", { name: "Your write-up" });
  if (!(await yours.isVisible().catch(() => false))) {
    await page.getByLabel("Your write-up").fill("Brute-forced all 25 shifts and kept the one whose first word read unpatched.");
    await page.getByRole("button", { name: "Publish write-up" }).click();
  }
  await expect(yours).toBeVisible({ timeout: 20000 });

  // Finish the track and see the stored badge on the CTF page.
  await page.goto("/ctf/the-repeating-key");
  await solveIfOpen(page, ctfFlag("c-crypto-2"));
  await page.goto("/ctf");
  await expect(page.getByText("Badge earned: Cryptography basics")).toBeVisible();
});
