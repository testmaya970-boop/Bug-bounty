import { test, expect } from "./qa-test";

// /profile (who you are, as others see it) and /settings (the private account) are separate
// pages, and external profiles (HackerOne included) are added, normalized, shown and removed.
test("profile and settings are different pages; a HackerOne profile is normalized, shown, and removed", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("e2e.veteran@unpatched.demo");
  await page.getByRole("textbox", { name: "Password" }).fill("E2ESeed!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

  // Direct loads of each URL render their own page (no redirect from one to the other).
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByText("Two-factor authentication")).toBeVisible();
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("External profiles")).toBeVisible();
  await expect(page.getByText("Two-factor authentication")).toHaveCount(0); // nothing private here

  // Add HackerOne by pasting the profile URL: only the handle is kept.
  await page.goto("/settings/external-services");
  const h1 = page.getByLabel("HackerOne username");
  await h1.fill("https://hackerone.com/e2e_veteran?type=user");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(h1).toHaveValue("e2e_veteran");
  await expect(page.getByRole("link", { name: "https://hackerone.com/e2e_veteran" })).toBeVisible();

  // A link to another site is refused, with a message on the field.
  await page.getByLabel("GitHub username").fill("https://evil.example/someone");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/That isn't a GitHub link/)).toBeVisible();
  await page.getByLabel("GitHub username").fill("");

  // The profile shows it as a link, marked as visible only to the researcher until opted in.
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: /HackerOne.*e2e_veteran/ })).toHaveAttribute("href", "https://hackerone.com/e2e_veteran");
  await expect(page.getByText(/Only you can see these/)).toBeVisible();

  // Removing it: clear the field and save.
  await page.goto("/settings/external-services");
  await page.getByLabel("HackerOne username").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: /HackerOne/ })).toHaveCount(0);

  // The account menu reaches each page.
  await page.goto("/");
  await page.getByRole("button", { name: "Account menu" }).first().click();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute("href", "/profile");
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("href", "/settings");
});
