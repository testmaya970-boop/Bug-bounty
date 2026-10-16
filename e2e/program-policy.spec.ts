import { test, expect, type Page } from "./qa-test";

// Program policy (db/migrations/202610060009) through the real UI: visible before joining
// (even signed out), accepted on the report form, bound to the submitted report with its
// response targets, and publishable by the organization. seed:e2e publishes v1 on the public
// program once; this spec publishes newer versions, so it never asserts a fixed number.

const PASSWORD = "E2ESeed!2026";
const fixture = async () => JSON.parse((await import("node:fs")).readFileSync("e2e/.seed-fixture.json", "utf-8")) as { organizationId: string; publicProgramId: string };

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test.describe.serial("program policy", () => {
  test("signed out, the public program shows its policy before anyone joins", async ({ page }) => {
    const { organizationId, publicProgramId } = await fixture();
    await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
    await expect(page.getByRole("heading", { name: "Program policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Safe harbor" })).toHaveAttribute("href", "/safe-harbor");
    await expect(page.getByText(/Coordinated disclosure/)).toBeVisible();
    await expect(page.getByText(/First response within/)).toBeVisible();
  });

  test("the program manager publishes a new version", async ({ page }) => {
    const { organizationId, publicProgramId } = await fixture();
    // The program's manager, not the owner: e2e.admin is near the sign-in limit (10 per 15 min) in a full run.
    await signIn(page, "e2e.program-manager@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}`);
    const versionText = await page.getByText(/Policy v\d+/).first().textContent();
    const current = Number(/Policy v(\d+)/.exec(versionText ?? "")?.[1]);
    await page.getByRole("button", { name: "Publish a new version" }).click();
    const dialog = page.getByRole("dialog", { name: `Publish policy v${current + 1}` });
    await dialog.getByLabel("First response (hours)").fill("48");
    await dialog.getByLabel("What changed (optional)").fill("E2E: tighter first response");
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(`Policy v${current + 1}`).first()).toBeVisible();
    await expect(page.getByText("First response within 2 days").first()).toBeVisible(); // 48h reads as days
  });

  test("a researcher must accept the policy to submit, and the report carries its targets", async ({ page }) => {
    const { organizationId, publicProgramId } = await fixture();
    await signIn(page, "e2e.veteran@unpatched.demo");
    await page.goto(`/organizations/${organizationId}/programs/${publicProgramId}/reports/new`);
    const title = `E2E policy-bound report ${Date.now().toString(36)}`;
    await page.getByLabel("Target type").selectOption("domain");
    await page.getByRole("combobox", { name: "Target", exact: true }).fill("api.e2e-public.example");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Weakness type").selectOption("idor");
    await page.getByLabel("Description").fill("Policy E2E: steps to reproduce.");
    await page.getByLabel("Impact").fill("Policy E2E: impact.");

    const accept = page.getByRole("checkbox", { name: /I have read and will follow .*'s policy \(v\d+\)/ });
    await expect(accept).toBeVisible();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page).toHaveURL(/\/reports\/new$/); // required: nothing submitted without accepting

    await accept.check();
    await page.getByRole("button", { name: "Submit report" }).click();
    await page.waitForURL(/\/reports\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Response targets")).toBeVisible();
    await expect(page.getByText(/Targets from program policy v\d+/)).toBeVisible();
    await expect(page.getByText("First response").first()).toBeVisible();
  });
});
