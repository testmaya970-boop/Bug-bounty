import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimplePageShell } from "../../components/simple-page-shell";

describe("SimplePageShell: a plain document layout, never the operational-dashboard sidebar", () => {
  it("renders the title exactly once, never duplicated by the page body's own heading", () => {
    const html = renderToStaticMarkup(
      <SimplePageShell title="Safe Harbor & Code of Conduct" user={{ id: "u1", displayName: "Riley", email: "riley@example.com" }}>
        <p>Body content</p>
      </SimplePageShell>,
    );
    const occurrences = html.split("Safe Harbor &amp; Code of Conduct").length - 1;
    expect(occurrences).toBe(1);
  });

  it("never renders the workspace sidebar nav groups (Research/Practice/Record/System) -- this is the whole point of the component", () => {
    const html = renderToStaticMarkup(
      <SimplePageShell title="Help" user={{ id: "u1", displayName: "Riley", email: null }}>
        <p>Body content</p>
      </SimplePageShell>,
    );
    expect(html).not.toContain("Dashboard");
    expect(html).not.toContain("Programs");
    expect(html).not.toContain("Notifications");
  });

  it("offers a real way back to the workspace and sign out for a signed-in user", () => {
    const html = renderToStaticMarkup(
      <SimplePageShell title="Help" user={{ id: "u1", displayName: "Riley", email: null }}>
        <p>Body content</p>
      </SimplePageShell>,
    );
    expect(html).toContain("Back to workspace");
    expect(html).toContain("Sign out");
  });

  it("offers a real sign-in link, not a broken back-to-workspace link, for an anonymous visitor", () => {
    const html = renderToStaticMarkup(
      <SimplePageShell title="Help" user={null}>
        <p>Body content</p>
      </SimplePageShell>,
    );
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Sign out");
  });
});
