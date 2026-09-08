import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationHeader } from "../../components/organizations/organization-header";
import { ProgramHeader } from "../../components/programs/program-header";

describe("OrganizationHeader: the same six-section sub-nav on every organization-scoped page", () => {
  it("renders the organization name and all six sections, with the first tab labeled Home and the second labeled Engagements (their routes/ids stay 'overview'/'programs' -- no new route, no duplicate page)", () => {
    const html = renderToStaticMarkup(<OrganizationHeader organizationId="org-1" organizationName="Acme Security" active="overview" />);
    expect(html).toContain("Acme Security");
    for (const label of ["Home", "Engagements", "Analytics", "Researchers", "Members", "Settings"]) expect(html).toContain(label);
  });

  it("marks the active section with aria-current, and only that one", () => {
    const html = renderToStaticMarkup(<OrganizationHeader organizationId="org-1" organizationName="Acme Security" active="members" />);
    const matches = html.match(/aria-current="page"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("links Settings to the real, per-organization settings route", () => {
    const html = renderToStaticMarkup(<OrganizationHeader organizationId="org-1" organizationName="Acme Security" active="overview" />);
    expect(html).toContain('href="/organizations/org-1/settings"');
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
