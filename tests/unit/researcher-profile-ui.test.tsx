import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfileSettings } from "../../components/settings/profile-settings";

// ProfileSettings calls useRouter() to refresh after a save, same reason every other
// client form in this codebase mocks next/navigation for static rendering.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

describe("ProfileSettings: the real, minimal self-service identity (see docs/decisions/0049)", () => {
  it("renders the current display name and biography, never a placeholder for real data", () => {
    const html = renderToStaticMarkup(<ProfileSettings initialDisplayName="Riley Researcher" initialBiography="Focused on API security." initialPublicUsername={null} />);
    expect(html).toContain("Riley Researcher");
    expect(html).toContain("Focused on API security.");
  });

  it("shows a real Display name field, a real Biography field, and a public-profile username field, each with its own Save", () => {
    const html = renderToStaticMarkup(<ProfileSettings initialDisplayName="Riley Researcher" initialBiography="" initialPublicUsername={null} />);
    expect(html).toContain("Display name");
    expect(html).toContain("Biography");
    expect(html).toContain("Public username");
    const saveButtons = html.match(/>Save</g) ?? [];
    expect(saveButtons.length).toBe(3);
  });

  it("never renders a skills/certification/location/social-metric field -- this profile is deliberately minimal", () => {
    const html = renderToStaticMarkup(<ProfileSettings initialDisplayName="Riley Researcher" initialBiography="" initialPublicUsername={null} />);
    expect(html.toLowerCase()).not.toContain("skill");
    expect(html.toLowerCase()).not.toContain("certification");
    expect(html.toLowerCase()).not.toContain("location");
    expect(html.toLowerCase()).not.toContain("follower");
  });
});
