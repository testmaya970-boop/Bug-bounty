import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicProgramList } from "../../components/programs/public-program-list";
import { TopBountyProgramsList } from "../../components/programs/top-bounty-programs-list";
import { JoinPublicProgramButton } from "../../components/programs/join-public-program-button";
import type { PublicProgramSummary, TopBountyProgram } from "../../types/program";

// JoinPublicProgramButton calls useRouter() (next/navigation) purely to navigate after a
// successful join -- it is never invoked during a static, pre-interaction render, but the
// hook itself throws outside an App Router context unless mocked, the same reason other
// client-component tests in this suite mock next/navigation rather than simulate routing.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SAMPLE_PROGRAM: PublicProgramSummary = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  organizationId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  name: "CloudVault Security",
  organizationName: "CloudVault",
  status: "active",
  description: "Web and API research program.",
  focusAreas: ["web_applications", "apis"],
  assetTypes: ["domain", "url"],
  bountyMinMinorUnits: 500000,
  bountyMaxMinorUnits: 2500000,
  bountyCurrency: "USD",
  activeResearcherCount: 12,
  resolvedReportCount: 4,
  updatedAt: "2026-08-31T00:00:00.000Z",
};

describe("PublicProgramList: an editorial registry, not a card wall -- every signal is real (see docs/decisions/0054)", () => {
  it("renders the program name, organization name, status, and description", () => {
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[SAMPLE_PROGRAM]} initialNextCursor={null} />);
    expect(html).toContain("CloudVault Security");
    expect(html).toContain("CloudVault");
    expect(html).toContain("Active");
    expect(html).toContain("Web and API research program.");
  });

  it("links each row to the real, existing program detail route -- no new URL scheme invented", () => {
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[SAMPLE_PROGRAM]} initialNextCursor={null} />);
    expect(html).toContain(`href="/organizations/${SAMPLE_PROGRAM.organizationId}/programs/${SAMPLE_PROGRAM.id}"`);
  });

  it("renders exactly the real bounty range, researcher count, and resolved-report count it was given -- never a hardcoded or rounded-differently value", () => {
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[SAMPLE_PROGRAM]} initialNextCursor={null} />);
    expect(html).toContain("$5,000 - $25,000");
    expect(html).toContain("12");
    expect(html).toContain("researchers");
    expect(html).toContain("4");
    expect(html).toContain("resolved");
  });

  it("renders no bounty range at all when the program has no configured policy (null, not a fabricated $0 range)", () => {
    const noBounty: PublicProgramSummary = { ...SAMPLE_PROGRAM, bountyMinMinorUnits: null, bountyMaxMinorUnits: null, bountyCurrency: null };
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[noBounty]} initialNextCursor={null} />);
    expect(html).not.toMatch(/\$\d/);
  });

  it("shows a real, honest zero for a brand-new program with no researchers or resolved reports yet, rather than hiding the row's stats entirely", () => {
    const brandNew: PublicProgramSummary = { ...SAMPLE_PROGRAM, activeResearcherCount: 0, resolvedReportCount: 0 };
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[brandNew]} initialNextCursor={null} />);
    expect(html).toContain("0 researchers");
    expect(html).toContain("0 resolved");
  });

  it("renders real focus-area and asset-type tags, never a raw enum value", () => {
    // The grid view truncates to the first 2 asset types / 1 focus area for card density
    // (see components/programs/public-program-grid.tsx) -- both truncated fields still
    // render their real, human-readable label, never a raw enum value, which is the
    // actual thing this test guards against.
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[SAMPLE_PROGRAM]} initialNextCursor={null} />);
    expect(html).toContain("Domain");
    expect(html).toContain("URL");
    expect(html).toContain("Websites / web applications");
    expect(html).not.toContain("web_applications");
    expect(html).not.toContain("apis");
  });

  it("renders an empty registry, not an error, when there are no public programs", () => {
    const html = renderToStaticMarkup(<PublicProgramList initialPrograms={[]} initialNextCursor={null} />);
    expect(html).not.toContain("CloudVault");
  });
});

describe("TopBountyProgramsList: the curated 'highest-paying' section, only ever a real, configured range", () => {
  const TOP: TopBountyProgram = {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa8",
    organizationId: "3fa85f64-5717-4562-b3fc-2c963f66afa9",
    name: "Vault Platform",
    organizationName: "Vault Inc",
    status: "active",
    bountyMinMinorUnits: 10000000,
    bountyMaxMinorUnits: 50000000,
    bountyCurrency: "USD",
  };

  it("renders the real bounty range and links to the real program", () => {
    const html = renderToStaticMarkup(<TopBountyProgramsList programs={[TOP]} />);
    expect(html).toContain("Vault Platform");
    expect(html).toContain("$100,000 - $500,000");
    expect(html).toContain(`href="/organizations/${TOP.organizationId}/programs/${TOP.id}"`);
  });
});

describe("JoinPublicProgramButton: joins, never submits a report itself", () => {
  it("renders a real button labelled to start researching, not a link that could be pre-fetched as a GET", () => {
    const html = renderToStaticMarkup(<JoinPublicProgramButton organizationId="org-1" programId="program-1" />);
    expect(html).toContain("<button");
    expect(html).toContain("Start researching");
  });
});
