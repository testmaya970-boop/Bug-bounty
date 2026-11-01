import { describe, expect, it } from "vitest";
import { extractOrganizationIdFromPath } from "../../lib/session/middleware";
import { resolveLastOrganizationId } from "../../components/app-shell";

describe("extractOrganizationIdFromPath: real navigation into an org, never a guess", () => {
  it("extracts the org id from an org-scoped path", () => {
    expect(extractOrganizationIdFromPath("/organizations/53b3bd1a-185d-4d8d-a8f9-d63482555bed")).toBe("53b3bd1a-185d-4d8d-a8f9-d63482555bed");
    expect(extractOrganizationIdFromPath("/organizations/53b3bd1a-185d-4d8d-a8f9-d63482555bed/programs/abc")).toBe("53b3bd1a-185d-4d8d-a8f9-d63482555bed");
  });

  it("returns null for the organizations picker page itself (no specific org named)", () => {
    expect(extractOrganizationIdFromPath("/organizations")).toBeNull();
  });

  it("returns null for a non-org-scoped path", () => {
    expect(extractOrganizationIdFromPath("/help")).toBeNull();
    expect(extractOrganizationIdFromPath("/settings/profile")).toBeNull();
  });

  it("returns null for a path that merely contains the word 'organizations' without a following id", () => {
    expect(extractOrganizationIdFromPath("/organizations/")).toBeNull();
  });
});

describe("resolveLastOrganizationId: a cookie is a hint, never trusted without re-validation", () => {
  const REAL_ORGS = [{ id: "org-1" }, { id: "org-2" }];

  it("resolves to the cookie's org id when it's a real membership", () => {
    expect(resolveLastOrganizationId("org-1", REAL_ORGS)).toBe("org-1");
  });

  it("returns undefined for a stale cookie naming an org this user has since left -- never falls back to a different real org (the exact array-order-guessing bug this codebase already fixed once)", () => {
    expect(resolveLastOrganizationId("org-9-no-longer-a-member", REAL_ORGS)).toBeUndefined();
  });

  it("returns undefined when there is no cookie at all", () => {
    expect(resolveLastOrganizationId(undefined, REAL_ORGS)).toBeUndefined();
  });

  it("returns undefined when the user has no real organizations at all, regardless of cookie content", () => {
    expect(resolveLastOrganizationId("org-1", [])).toBeUndefined();
  });
});
