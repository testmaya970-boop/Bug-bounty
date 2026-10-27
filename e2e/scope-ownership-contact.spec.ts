import { test, expect, type Page } from "./qa-test";
import { passMfaGate } from "./mfa-gate";

// 202610260008-0010 through the real UI: an organization cannot send researchers at a domain it
// has not proved it owns, and an organization can reach Unpatched from the public contact page
// before it has an account; platform staff see and close the message.

const PASSWORD = "E2ESeed!2026";
const tag = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await passMfaGate(page, email);
}

test("an unverified domain in scope is flagged, blocks launch, and the domain shows its DNS proof steps", async ({ page }) => {
  const t = tag();
  await signIn(page, "e2e.launch-admin@unpatched.demo");
  await page.goto("/organizations");
  await page.getByRole("link", { name: /E2E Launch Org/ }).click();
  await page.waitForURL(/\/organizations\/[0-9a-f-]{36}/);
  const orgUrl = /\/organizations\/[0-9a-f-]{36}/.exec(page.url())![0];

  // A draft engagement whose only in-scope asset is somebody else's domain.
  await page.goto(`${orgUrl}/programs`);
  await page.getByRole("button", { name: /Create (another )?engagement/ }).first().click();
  await page.getByLabel("Engagement name").fill(`Ownership ${t}`);
  await page.getByRole("dialog").getByRole("button", { name: "Create engagement" }).click();
  await page.waitForURL(/\/programs\/[0-9a-f-]{36}$/);

  const foreign = `api.not-ours-${t}.com`;
  await page.getByRole("button", { name: "Add scope" }).click();
  const add = page.getByRole("dialog", { name: "Add scope entry" });
  await add.getByRole("textbox", { name: /^Target/ }).fill(foreign);
  await add.getByRole("button", { name: "Add scope entry" }).click();
  await expect(add).not.toBeVisible();
  await expect(page.getByText(/Not testable yet: hidden from researchers until you/)).toBeVisible();
  await page.screenshot({ path: "test-results/scope-ownership/1-unverified-entry.png", fullPage: true });

  await page.getByRole("button", { name: "Submit for review" }).first().click();
  await expect(page.getByText(/prove ownership of at least one in-scope asset first/i).first()).toBeVisible();

  // The notice links to the domain proof in organization settings.
  await page.getByRole("link", { name: "verify you own this domain" }).click();
  await page.waitForURL(/\/settings#verified-domains$/);
  const domain = `owned-${t}.com`;
  await page.getByRole("textbox", { name: "Domain" }).fill(`https://${domain}/`);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(`_unpatched-challenge.${domain}`)).toBeVisible();
  await expect(page.getByText(/^unpatched-verification=[0-9a-f]{36}$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Check DNS" }).last().click();
  // No such record exists, so the server's own lookup must refuse to verify it.
  await expect(page.getByRole("alert").filter({ hasText: /TXT record|DNS lookup failed/ })).toBeVisible();
  await page.screenshot({ path: "test-results/scope-ownership/2-domain-pending.png", fullPage: true });
});

test("an organization contacts Unpatched before signing up; platform staff see it and close it", async ({ page, browser }) => {
  const t = tag();
  const company = `Contact Co ${t}`;
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Contact" }).click();
  await expect(page.getByRole("heading", { name: "Talk to us before you launch" })).toBeVisible();

  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Work email").fill("asha@gmail.com");
  await page.getByLabel("Company").fill(company);
  await page.getByLabel("Message").fill("We run a payments API and want a private pilot next month.");
  const human = page.getByLabel(/I.m a person/);
  if (await human.count()) await human.check();
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Use your work email/)).toBeVisible();

  await page.getByLabel("Work email").fill(`asha.${t}@contactco-${t}.example`);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message received.")).toBeVisible();
  await page.screenshot({ path: "test-results/contact/1-sent.png", fullPage: true });

  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, "e2e.platform-admin@unpatched.demo");
  await admin.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contact requests" }).click();
  await admin.waitForURL(/\/platform\/contact-requests$/);
  const item = admin.getByRole("listitem").filter({ hasText: company });
  await expect(item).toContainText("Launching a bug bounty or VDP");
  await item.getByRole("button", { name: "Mark handled" }).click();
  await expect(item).toContainText("Handled");
  await admin.screenshot({ path: "test-results/contact/2-inbox.png", fullPage: true });
});
