import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommandRow } from "../../components/dashboard/command-row";
import { MOCK_RESEARCHER_STATUS } from "../../lib/mock/researcher-dashboard";

const ACTION = {
  eyebrow: "Research",
  title: "Find your next security target",
  description: "Browse public programs open to the community.",
  label: "Browse programs",
  href: "/programs" as const,
};

describe("CommandRow: the action title is not a second heading -- the shell's own <h1> already carries it (app/page.tsx passes primaryAction.title as AppShell's title)", () => {
  it("renders the real action title as plain text, never an <h1>/<h2>/<h3>", () => {
    const html = renderToStaticMarkup(<CommandRow action={ACTION} status={MOCK_RESEARCHER_STATUS} />);
    expect(html).toContain("Find your next security target");
    expect(html).not.toMatch(/<h1[ >]/);
    expect(html).not.toMatch(/<h2[ >]/);
    expect(html).not.toMatch(/<h3[ >]/);
  });

  it("still shows the eyebrow, description, and action label -- only the heading element changed, not the content", () => {
    const html = renderToStaticMarkup(<CommandRow action={ACTION} status={MOCK_RESEARCHER_STATUS} />);
    expect(html).toContain("Research");
    expect(html).toContain("Browse public programs open to the community.");
    expect(html).toContain("Browse programs");
  });
});
