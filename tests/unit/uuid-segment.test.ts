import { describe, expect, it } from "vitest";
import { hasMalformedIdSegment } from "../../lib/uuid-segment";

const ID = "53b3bd1a-185d-4d8d-a8f9-d63482555bed";

describe("hasMalformedIdSegment", () => {
  it("flags a non-uuid in any id position", () => {
    expect(hasMalformedIdSegment("/organizations/not-a-uuid")).toBe(true);
    expect(hasMalformedIdSegment(`/organizations/${ID}/programs/nope`)).toBe(true);
    expect(hasMalformedIdSegment(`/organizations/${ID}/programs/${ID}/reports/nope`)).toBe(true);
    expect(hasMalformedIdSegment(`/organizations/${ID}/members/nope`)).toBe(true);
    expect(hasMalformedIdSegment(`/organizations/${ID}/researchers/nope/extra`)).toBe(true);
  });

  it("passes valid ids, static routes, and everything outside /organizations", () => {
    for (const path of [
      "/organizations",
      "/organizations/sign-up",
      `/organizations/${ID}`,
      `/organizations/${ID}/findings`,
      `/organizations/${ID}/programs`,
      `/organizations/${ID}/programs/${ID}/inbox`,
      `/organizations/${ID}/programs/${ID}/reports`,
      `/organizations/${ID}/programs/${ID}/reports/new`,
      `/organizations/${ID}/programs/${ID}/reports/${ID}`,
      `/organizations/${ID}/members/${ID}`,
      "/programs/not-a-uuid",
      "/",
    ]) {
      expect(hasMalformedIdSegment(path), path).toBe(false);
    }
  });
});
