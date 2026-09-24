import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearcherScopeView } from "../../components/programs/researcher-scope-view";
import type { ScopeEntry } from "../../types/scope";

function makeEntry(overrides: Partial<ScopeEntry>): ScopeEntry {
  return {
    id: "entry-1",
    programId: "program-1",
    organizationId: "org-1",
    assetType: "domain",
    target: "example.com",
    displayTarget: "example.com",
    scopeState: "in_scope",
    description: null,
    status: "active",
    createdBy: "user-1",
    createdByName: "Test User",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    removedAt: null,
    ...overrides,
  };
}

describe("ResearcherScopeView: in-scope and explicit out-of-scope exclusions", () => {
  it("shows nothing-added empty state when there are no entries at all", () => {
    const html = renderToStaticMarkup(<ResearcherScopeView entries={[]} />);
    expect(html).toContain("No in-scope assets yet");
  });

  it("shows the in-scope-empty state when only out-of-scope entries exist, but still shows the exclusion", () => {
    const entries = [makeEntry({ id: "e1", target: "admin.example.com", displayTarget: "admin.example.com", scopeState: "out_of_scope" })];
    const html = renderToStaticMarkup(<ResearcherScopeView entries={entries} />);
    expect(html).toContain("No in-scope assets yet");
    expect(html).toContain("Explicitly out of scope");
    expect(html).toContain("admin.example.com");
  });

  it("renders both an in-scope wildcard and an explicit carve-out exclusion, distinctly labeled", () => {
    const entries = [
      makeEntry({ id: "e1", target: "*.example.com", displayTarget: "*.example.com", scopeState: "in_scope" }),
      makeEntry({ id: "e2", target: "admin.example.com", displayTarget: "admin.example.com", scopeState: "out_of_scope" }),
    ];
    const html = renderToStaticMarkup(<ResearcherScopeView entries={entries} />);
    expect(html).toContain("*.example.com");
    expect(html).toContain("admin.example.com");
    expect(html).toContain("Explicitly out of scope");
    expect(html).not.toContain("No in-scope assets yet");
  });

  it("never mixes an out-of-scope target into the in-scope groups", () => {
    const entries = [
      makeEntry({ id: "e1", target: "api.example.com", displayTarget: "api.example.com", assetType: "domain", scopeState: "in_scope" }),
      makeEntry({ id: "e2", target: "internal.example.com", displayTarget: "internal.example.com", assetType: "domain", scopeState: "out_of_scope" }),
    ];
    const html = renderToStaticMarkup(<ResearcherScopeView entries={entries} />);
    // Both targets appear exactly once each, and the out-of-scope one only inside its own section.
    const exclusionSectionStart = html.indexOf("Explicitly out of scope");
    expect(exclusionSectionStart).toBeGreaterThan(-1);
    expect(html.indexOf("internal.example.com")).toBeGreaterThan(exclusionSectionStart);
  });

  it("omits the exclusions section entirely when there are no out-of-scope entries", () => {
    const entries = [makeEntry({ id: "e1" })];
    const html = renderToStaticMarkup(<ResearcherScopeView entries={entries} />);
    expect(html).not.toContain("Explicitly out of scope");
  });
});
