import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationHeader } from "../../components/organizations/organization-header";
import { ProgramHeader } from "../../components/programs/program-header";

describe("OrganizationHeader: identity block only -- Turn 8b deleted the org-level tab row (nav lives solely in the sidebar, components/app-shell-client.tsx)", () => {
  it("renders the organization name", () => {
    const html = renderToStaticMarkup(<OrganizationHeader organizationName="Acme Security" />);
    expect(html).toContain("Acme Security");
  });

  it("renders no nav/links -- there is no second nav here to highlight anything in", () => {
    const html = renderToStaticMarkup(<OrganizationHeader organizationName="Acme Security" />);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("aria-current");
  });
});

describe("ProgramHeader: the same sub-nav on the program detail page and its triage inbox", () => {
  it("renders the program name and real status", () => {
    const html = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="overview" canManage={true} />);
    expect(html).toContain("CloudVault");
    expect(html).toContain("Active");
  });

  it("only shows Researchers to a viewer who can manage the program", () => {
    const withManager = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="overview" canManage={true} />);
    const withoutManager = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="overview" canManage={false} />);
    expect(withManager).toContain("Researchers");
    expect(withoutManager).not.toContain("Researchers");
  });

  it("only shows Reports to a viewer who can manage the program -- its target route (the triage inbox) denies anyone else, so the tab would otherwise be a dead end for a researcher (see docs/decisions/0048)", () => {
    const withManager = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="overview" canManage={true} />);
    const withoutManager = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="overview" canManage={false} />);
    expect(withManager).toContain("Reports");
    expect(withoutManager).not.toContain("Reports");
  });

  it("Scope and Researchers link to anchors on the program detail page, Reports links to the dedicated triage inbox route", () => {
    const html = renderToStaticMarkup(<ProgramHeader organizationId="org-1" programId="prog-1" programName="CloudVault" status="active" active="reports" canManage={true} />);
    expect(html).toContain('href="/organizations/org-1/programs/prog-1#scope"');
    expect(html).toContain('href="/organizations/org-1/programs/prog-1#researchers"');
    expect(html).toContain('href="/organizations/org-1/programs/prog-1/reports"');
  });
});
