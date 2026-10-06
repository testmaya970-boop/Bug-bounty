import { test, expect, type Page } from "@playwright/test";

// Real, browser-driven CTF coverage against a prod build (playwright.config.ts):
//  - solving one challenge per category end-to-end (submit the flag a player would derive
//    from that challenge's own artifact, assert the server accepts it and records the solve),
//  - a seeded event's real leaderboard rendering a seeded solve,
//  - the platform-admin event-creation flow.
//
// Flags below are the ones a player derives by doing each challenge's technique against its
// embedded/downloadable artifact (verified independently by npm run ctf:artifacts:verify).
// They are the submission a solver would make -- not read from any app response.

const PASSWORD = "E2ESeed!2026";
const RESEARCHER_EMAIL = "e2e.veteran@unpatched.demo"; // a seeded researcher
// Tests that don't need the veteran's own data sign in as hunter instead: the sign-in rate
// limit is 10 per email per 15 minutes, and the veteran is shared by several specs.
const BROWSER_EMAIL = "e2e.hunter@unpatched.demo";
const FRESH_EMAIL = "e2e.newcomer@unpatched.demo"; // used for first-time solves (no prior CTF solves seeded except the ended-event backfill)
const ADMIN_EMAIL = "e2e.platform-admin@unpatched.demo"; // a seeded platform admin

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

// One challenge per category (slug -> flag). newcomer has no practice solves for these
// (only an ended-event backfill of c-web-1, which is web -- so use a different web slug here).
const ONE_PER_CATEGORY: Array<{ slug: string; flag: string; category: string }> = [
  { slug: "search-and-destroy", flag: "unpatched{r3fl3ct3d_xss_101}", category: "web" },
  { slug: "rotten-cipher", flag: "unpatched{caesar_was_n0_cryptographer}", category: "crypto" },
  { slug: "the-license-checker", flag: "unpatched{str1ngs_and_a_d1sassembler}", category: "reverse-engineering" },
  { slug: "buffer-of-secrets", flag: "unpatched{cl4ssic_st4ck_0v3rfl0w}", category: "binary-pwn" },
  { slug: "the-hidden-stream", flag: "unpatched{app3nd3d_data_aft3r_e0i}", category: "forensics" },
  { slug: "the-hidden-channel", flag: "unpatched{dns_tunn3l_data_ex0}", category: "network" },
];

test.describe("CTF challenges are solvable", () => {
  test("each category: the challenge page shows its material and accepts the derived flag", async ({ page }) => {
    await signIn(page, FRESH_EMAIL);

    for (const { slug, flag } of ONE_PER_CATEGORY) {
      await page.goto(`/ctf/${slug}`);
      // The challenge material (embedded text and/or a download) is present.
      await expect(page.getByText("Challenge material")).toBeVisible();

      const flagField = page.getByLabel("Flag");
      // If a prior run already solved it, the form is replaced by a Solved summary -- accept that.
      if (await flagField.isVisible().catch(() => false)) {
        await flagField.fill(flag);
        await page.getByRole("button", { name: "Submit flag" }).click();
        await expect(page.getByText(/points/i).first()).toBeVisible({ timeout: 20000 });
      }
      // Either way, the page now shows the solved state.
      await expect(page.getByText("Solved", { exact: false }).first()).toBeVisible({ timeout: 20000 });
    }
  });

  test("a downloadable artifact challenge exposes a real Download link", async ({ page }) => {
    await signIn(page, BROWSER_EMAIL);
    await page.goto("/ctf/the-unencrypted-login"); // network pcap challenge
    await expect(page.getByText("Challenge material")).toBeVisible();
    const link = page.getByRole("link", { name: /capture\.pcap/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /\/ctf-artifacts\/c-network-1\/capture\.pcap$/);
  });

  test("a wrong flag is still refused (regression guard on the existing behaviour)", async ({ page }) => {
    await signIn(page, BROWSER_EMAIL);
    await page.goto("/ctf/type-juggler");
    await page.getByLabel("Flag").fill("unpatched{not_the_flag}");
    await page.getByRole("button", { name: "Submit flag" }).click();
    await expect(page.getByText("Incorrect flag. Try again.")).toBeVisible();
  });
});

test.describe("CTF events", () => {
  test("the events tab lists seeded events by state", async ({ page }) => {
    await signIn(page, BROWSER_EMAIL);
    await page.goto("/ctf?tab=events");
    await expect(page.getByRole("link", { name: /E2E Live Fire/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /E2E Winter Open/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /E2E Past Clash/ })).toBeVisible();
  });

  test("an ended event shows its real, final leaderboard with the seeded solves", async ({ page }) => {
    await signIn(page, RESEARCHER_EMAIL);
    await page.goto("/ctf/events/e2e-past-clash");
    await expect(page.getByRole("heading", { name: "E2E Past Clash" })).toBeVisible();
    await expect(page.getByText("Event leaderboard")).toBeVisible();
    // The veteran (this account) is #1 with 450 pts from the seeded backfill.
    await expect(page.getByText("450")).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toBeVisible();
  });

  test("solving a challenge inside the active event counts toward its leaderboard", async ({ page }) => {
    await signIn(page, FRESH_EMAIL);
    // c-forensics-1 (the-hidden-stream) is in the active event and not seeded-solved for newcomer.
    await page.goto("/ctf/events/e2e-live-fire");
    await expect(page.getByRole("heading", { name: "E2E Live Fire" })).toBeVisible();
    // Go into the challenge from the event context and solve it.
    await page.goto("/ctf/the-hidden-stream");
    const flagField = page.getByLabel("Flag");
    if (await flagField.isVisible().catch(() => false)) {
      await flagField.fill("unpatched{app3nd3d_data_aft3r_e0i}");
      await page.getByRole("button", { name: "Submit flag" }).click();
      await expect(page.getByText(/points/i).first()).toBeVisible({ timeout: 20000 });
    }
    // The newcomer now appears on the active event's leaderboard.
    await page.goto("/ctf/events/e2e-live-fire");
    await expect(page.getByText("You", { exact: true })).toBeVisible({ timeout: 20000 });
  });
});

test.describe("platform admin: CTF event management", () => {
  test("an admin can create an event and pick its challenges", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto("/platform/ctf-events");
    await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();

    const slug = `admin-made-${Date.now().toString(36)}`;
    await page.getByLabel("Name").fill("Admin Made Event");
    await page.getByLabel("Slug").fill(slug);
    // datetime-local inputs: set a window starting now.
    const start = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString().slice(0, 16);
    await page.getByLabel("Starts at").fill(start);
    await page.getByLabel("Ends at").fill(end);
    await page.getByRole("button", { name: "Create event" }).click();

    // Lands on the edit page; pick a couple of challenges and save.
    await page.waitForURL(/\/platform\/ctf-events\/[0-9a-f-]+$/);
    await expect(page.getByText("Challenges in this event")).toBeVisible();
    await page.getByRole("checkbox", { name: /The Cookie Jar/ }).check();
    await page.getByRole("checkbox", { name: /Rotten Cipher/ }).check();
    await page.getByRole("button", { name: "Save challenge set" }).click();
    await expect(page.getByText("Saved.").first()).toBeVisible({ timeout: 20000 });
  });
});
