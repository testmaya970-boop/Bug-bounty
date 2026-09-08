import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreateProgramDialog } from "../../components/programs/create-program-dialog";
import { ProgramStatusBadge } from "../../components/ui/badge";
import { ENGAGEMENT_TYPE_ORDER, engagementTypeLabel } from "../../lib/program-status";

// CreateProgramDialog calls useRouter() unconditionally, same as CreateOrganizationDialog
// -- outside a mounted Next.js router that throws rather than degrading gracefully, so it
// must be mocked for static rendering (see organization-creation-ui.test.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

describe("CreateProgramDialog", () => {
  it("defaults to closed, showing only the trigger", () => {
    const html = renderToStaticMarkup(<CreateProgramDialog organizationId="org-1" />);
    expect(html).toContain("Create engagement");
    expect(html).not.toContain("You'll be its manager");
  });

  it("supports a custom trigger label for the 'create another' case", () => {
    const html = renderToStaticMarkup(<CreateProgramDialog organizationId="org-1" triggerLabel="Create another engagement" />);
    expect(html).toContain("Create another engagement");
  });
});

describe("Engagement type presentation (docs/decisions/0076) -- lib/program-status.ts, the pure logic CreateProgramDialog's engagement-type select renders from. Dialog's own internal form fields only mount once open=true (Dialog returns null when closed -- confirmed live, not testable via renderToStaticMarkup against a component that never sets open=true; that requires interactive rendering, which this codebase's test suite does not yet have infrastructure for), so this asserts on the real, shared source of truth the dialog reads instead of guessing at rendered markup that cannot appear.", () => {
  it("ENGAGEMENT_TYPE_ORDER lists every real EngagementType exactly once, in the canonical HackerOne-style tab/select order", () => {
    expect(ENGAGEMENT_TYPE_ORDER).toEqual(["bug_bounty", "response", "pentest", "code_audit", "challenge", "campaign", "spot_check"]);
    expect(new Set(ENGAGEMENT_TYPE_ORDER).size).toBe(ENGAGEMENT_TYPE_ORDER.length);
  });

  it("engagementTypeLabel gives every real type a distinct, human-readable label", () => {
    const labels = ENGAGEMENT_TYPE_ORDER.map(engagementTypeLabel);
    expect(labels).toEqual(["Bug Bounty", "Response", "Pentest", "Code Audit", "Challenge", "Campaign", "Spot Check"]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("ProgramStatusBadge", () => {
  it("renders a distinct, human-readable label for every DOMAIN.md lifecycle state", () => {
    const expected = { draft: "Draft", review: "In review", active: "Active", paused: "Paused", closed: "Closed" } as const;
    for (const [status, label] of Object.entries(expected)) {
      const html = renderToStaticMarkup(<ProgramStatusBadge status={status as keyof typeof expected} />);
      expect(html).toContain(label);
    }
  });
});
