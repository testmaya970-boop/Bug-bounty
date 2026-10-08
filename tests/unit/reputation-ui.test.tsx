import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReputationSummarySection } from "../../components/reputation/reputation-summary";
import { ReputationLedgerSection } from "../../components/reputation/reputation-ledger";
import { ReputationProgramContext } from "../../components/reputation/reputation-programs";
import type { ReputationLedgerEntry } from "../../types/reputation";

describe("ReputationSummarySection: real counts only, no gamification, no card-wall", () => {
  it("renders only non-zero categories, with plain counts", () => {
    const html = renderToStaticMarkup(
      <ReputationSummarySection
        counts={[
          { factType: "report_resolved", count: 3 },
          { factType: "report_duplicate", count: 0 },
          { factType: "bounty_finalized", count: 1 },
        ]}
      />,
    );
    expect(html).toContain("Resolved reports");
    expect(html).toContain(">3<");
    expect(html).toContain("Bounties finalized");
    expect(html).toContain(">1<");
    expect(html).not.toContain("Duplicate reports");
  });

  it("renders nothing (an empty row, no placeholder text) when every count is zero -- the empty case is the page's job, not this component's", () => {
    const html = renderToStaticMarkup(<ReputationSummarySection counts={[]} />);
    expect(html).not.toMatch(/resolved|duplicate|informative|rejected|finalized/i);
  });

  it("never mentions leaderboard, badge, level, XP, or rank -- no gamification language anywhere", () => {
    const html = renderToStaticMarkup(
      <ReputationSummarySection
        counts={[
          { factType: "report_resolved", count: 5 },
          { factType: "report_duplicate", count: 2 },
          { factType: "report_informative", count: 1 },
          { factType: "report_not_applicable", count: 1 },
          { factType: "report_rejected", count: 1 },
          { factType: "bounty_finalized", count: 2 },
        ]}
      />,
    );
    expect(html.toLowerCase()).not.toMatch(/\b(leaderboard|badge|level|xp|rank|score)\b/);
  });

  it("does not render a bordered card-grid tile wrapper -- a plain label-above-value row instead", () => {
    const html = renderToStaticMarkup(<ReputationSummarySection counts={[{ factType: "report_resolved", count: 1 }]} />);
    expect(html).not.toMatch(/rounded-md border border-border p-3/);
  });
});

const BASE_ENTRY: ReputationLedgerEntry = {
  id: "ledger-1",
  factType: "report_resolved",
  reportId: "report-1",
  programId: "program-1",
  organizationId: "org-1",
  confirmedSeverity: "high",
  duplicateOfReportId: null,
  occurredAt: "2026-08-29T00:00:00Z",
};

describe("ReputationLedgerSection: real evidence, real links, honest degradation", () => {
  it("renders the event label, joined report title, program name, and severity", () => {
    const html = renderToStaticMarkup(
      <ReputationLedgerSection initialEntries={[BASE_ENTRY]} initialNextCursor={null} evidenceByReportId={{ "report-1": { title: "Reflected XSS on search", programName: "CloudVault" } }} />,
    );
    expect(html).toContain("Report resolved");
    expect(html).toContain("Reflected XSS on search");
    expect(html).toContain("CloudVault");
    expect(html).toContain("High");
  });

  it("links to the real, existing report route using all three real ids -- never a fabricated route", () => {
    const html = renderToStaticMarkup(<ReputationLedgerSection initialEntries={[BASE_ENTRY]} initialNextCursor={null} evidenceByReportId={{}} />);
    expect(html).toContain("/organizations/org-1/programs/program-1/reports/report-1");
  });

  it("a CTF solve (no report, program or organization) links to /ctf, never /organizations/null/...", () => {
    const ctf: ReputationLedgerEntry = { ...BASE_ENTRY, id: "fact-ctf", factType: "ctf_challenge_solved", reportId: null, programId: null, organizationId: null, confirmedSeverity: null };
    const html = renderToStaticMarkup(<ReputationLedgerSection initialEntries={[ctf]} initialNextCursor={null} evidenceByReportId={{}} />);
    expect(html).not.toContain("null");
    expect(html).toContain('href="/ctf"');
    expect(html).toContain("CTF challenge solved");
  });

  it("degrades to a bare 'Report' label (never an error, never blank) when the report is outside the joined evidence page", () => {
    const html = renderToStaticMarkup(<ReputationLedgerSection initialEntries={[BASE_ENTRY]} initialNextCursor={null} evidenceByReportId={{}} />);
    expect(html).toContain(">Report<");
  });

  it("never shows a severity badge when confirmedSeverity is null or 'none'", () => {
    const html = renderToStaticMarkup(
      <ReputationLedgerSection initialEntries={[{ ...BASE_ENTRY, confirmedSeverity: null }, { ...BASE_ENTRY, id: "ledger-2", confirmedSeverity: "none" }]} initialNextCursor={null} evidenceByReportId={{}} />,
    );
    expect(html).not.toMatch(/text-severity-/);
  });

  it("distinguishes each real fact type with its own honest event label -- never a fabricated status", () => {
    const html = renderToStaticMarkup(
      <ReputationLedgerSection
        initialEntries={[
          { ...BASE_ENTRY, id: "e1", factType: "report_duplicate" },
          { ...BASE_ENTRY, id: "e2", factType: "bounty_finalized" },
        ]}
        initialNextCursor={null}
        evidenceByReportId={{}}
      />,
    );
    expect(html).toContain("Report marked duplicate");
    expect(html).toContain("Bounty finalized");
  });

  it("shows 'Load more' when a next cursor is present, 'End of results.' otherwise", () => {
    const withCursor = renderToStaticMarkup(<ReputationLedgerSection initialEntries={[BASE_ENTRY]} initialNextCursor="cursor-1" evidenceByReportId={{}} />);
    expect(withCursor).toContain("Load more");
    expect(withCursor).not.toContain("End of results.");

    const withoutCursor = renderToStaticMarkup(<ReputationLedgerSection initialEntries={[BASE_ENTRY]} initialNextCursor={null} evidenceByReportId={{}} />);
    expect(withoutCursor).not.toContain("Load more");
    expect(withoutCursor).toContain("End of results.");
  });
});

describe("ReputationProgramContext: real, unfabricated per-program totals", () => {
  it("renders each program's real verified-outcome count, most-evidenced first", () => {
    const html = renderToStaticMarkup(
      <ReputationProgramContext
        programCounts={[
          { programId: "p1", count: 1 },
          { programId: "p2", count: 3 },
        ]}
        programNames={new Map([["p1", "AcmePay"], ["p2", "CloudVault"]])}
      />,
    );
    const cloudVaultIndex = html.indexOf("CloudVault");
    const acmePayIndex = html.indexOf("AcmePay");
    expect(cloudVaultIndex).toBeGreaterThan(-1);
    expect(cloudVaultIndex).toBeLessThan(acmePayIndex);
    expect(html).toContain("3 verified outcomes");
    expect(html).toContain("1 verified outcome<");
  });

  it("degrades to 'Unknown program' rather than erroring when a program name is unavailable", () => {
    const html = renderToStaticMarkup(<ReputationProgramContext programCounts={[{ programId: "p1", count: 2 }]} programNames={new Map()} />);
    expect(html).toContain("Unknown program");
  });

  it("renders nothing when there are no program counts at all", () => {
    const html = renderToStaticMarkup(<ReputationProgramContext programCounts={[]} programNames={new Map()} />);
    expect(html).toBe("");
  });
});
