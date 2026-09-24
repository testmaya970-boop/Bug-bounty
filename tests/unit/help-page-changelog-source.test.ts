import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const helpPageSource = readFileSync(`${repoRoot}app/help/page.tsx`, "utf-8");

// Real bug, confirmed live: /help used to read the repository's own root CHANGELOG.md
// straight off the filesystem and render it to every signed-in user with no review gate
// -- that file is written for developers and can legitimately gain an internal
// implementation detail (a migration name, a vendor/library reference) in any future
// commit, which would then be instantly public. Fixed by reading docs/user-changelog.md,
// a small, separately curated file -- this test is a static regression guard against
// /help ever being pointed back at the raw engineering changelog again.
describe("app/help/page.tsx: release notes read from the curated user-facing changelog, never the raw engineering one", () => {
  it("reads docs/user-changelog.md", () => {
    expect(helpPageSource).toContain('"docs", "user-changelog.md"');
  });

  it("never reads the repository root CHANGELOG.md", () => {
    expect(helpPageSource).not.toMatch(/["'`]CHANGELOG\.md["'`]/);
  });
});
