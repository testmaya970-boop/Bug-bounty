import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddScopeEntryDialog } from "../../components/programs/add-scope-entry-dialog";
import { ScopeEntryCard } from "../../components/programs/scope-entry-card";
import { AssetTypeBadge, ScopeStateBadge } from "../../components/ui/badge";
import type { ScopeEntry } from "../../types/scope";

// Both components call useRouter() unconditionally, same reason as CreateOrganizationDialog
// (see organization-creation-ui.test.tsx) -- must be mocked for static rendering.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const entry: ScopeEntry = {
  id: "entry-1",
  programId: "prog-1",
  organizationId: "org-1",
  assetType: "domain",
  target: "*.example.com",
  displayTarget: "*.example.com",
  scopeState: "in_scope",
  description: "Production surface",
  status: "active",
  createdBy: "actor-1",
  createdByName: "Alice",
  createdAt: "2026-08-26T00:00:00Z",
  updatedAt: "2026-08-26T00:00:00Z",
  removedAt: null,
};

describe("AddScopeEntryDialog", () => {
  it("defaults to closed, showing only the trigger", () => {
    const html = renderToStaticMarkup(<AddScopeEntryDialog organizationId="org-1" programId="prog-1" />);
    expect(html).toContain("Add scope");
    expect(html).not.toContain("permitted to test");
  });
});

describe("ScopeEntryCard", () => {
  it("shows the real target, type, state, description, and attribution -- not a placeholder", () => {
    const html = renderToStaticMarkup(<ScopeEntryCard organizationId="org-1" programId="prog-1" entry={entry} canManage={true} />);
    expect(html).toContain("*.example.com");
    expect(html).toContain("Domain");
    expect(html).toContain("In scope");
    expect(html).toContain("Production surface");
    expect(html).toContain("Alice");
  });

  it("hides mutation actions when the caller cannot manage scope (e.g. program is no longer draft)", () => {
    const html = renderToStaticMarkup(<ScopeEntryCard organizationId="org-1" programId="prog-1" entry={entry} canManage={false} />);
    expect(html).not.toContain("Mark out of scope");
    expect(html).not.toContain(">Remove<");
  });

  it("shows mutation actions when the caller can manage scope", () => {
    const html = renderToStaticMarkup(<ScopeEntryCard organizationId="org-1" programId="prog-1" entry={entry} canManage={true} />);
    expect(html).toContain("Mark out of scope");
    expect(html).toContain(">Remove<");
  });

  it("never shows a color-only state -- ScopeStateBadge always carries its text label", () => {
    const inScopeHtml = renderToStaticMarkup(<ScopeStateBadge state="in_scope" />);
    const outOfScopeHtml = renderToStaticMarkup(<ScopeStateBadge state="out_of_scope" />);
    expect(inScopeHtml).toContain("In scope");
    expect(outOfScopeHtml).toContain("Out of scope");
  });
});

describe("AssetTypeBadge", () => {
  it("renders a human-readable label for every supported asset type", () => {
    const labels = { domain: "Domain", url: "URL", ip_cidr: "IP / CIDR" } as const;
    for (const [assetType, label] of Object.entries(labels)) {
      const html = renderToStaticMarkup(<AssetTypeBadge assetType={assetType as keyof typeof labels} />);
      expect(html).toContain(label);
    }
  });
});
