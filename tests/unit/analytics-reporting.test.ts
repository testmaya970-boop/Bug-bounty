import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { computeAnalytics, healthScore, median, weekStart, type ReportFact } from "../../lib/analytics/report-metrics";
import { filtersToSearch, parseAnalyticsFilters, scheduledFilters } from "../../lib/analytics/filters";
import { buildXlsx } from "../../lib/exports/xlsx";
import { buildCsv, buildExecutivePdf, buildWorkbook, exportFileName } from "../../lib/exports/analytics-files";

const NOW = new Date("2026-10-28T12:00:00Z");

function fact(over: Partial<ReportFact>): ReportFact {
  return {
    reportId: crypto.randomUUID(),
    title: "XSS in search",
    programId: "p1",
    programName: "Web",
    assetId: "a1",
    assetLabel: "app.example.com",
    assetType: "domain",
    severity: "high",
    cvssScore: 7.5,
    status: "resolved",
    researcherId: "r1",
    researcherName: "Asha",
    submittedAt: "2026-10-20T00:00:00Z",
    firstResponseAt: "2026-10-20T10:00:00Z",
    triagedAt: "2026-10-21T00:00:00Z",
    closedAt: "2026-10-25T00:00:00Z",
    firstResponseTargetHours: 24,
    triageTargetHours: 72,
    resolutionTargetDays: 30,
    bountyCurrency: "USD",
    bountyAwardedMinorUnits: 50000,
    bountyPaidMinorUnits: 50000,
    ...over,
  };
}

describe("report metrics", () => {
  it("median, Monday weeks and the health score", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(weekStart("2026-10-28T23:00:00Z")).toBe("2026-10-26"); // Wednesday -> Monday
    expect(weekStart("2026-10-26T00:00:00Z")).toBe("2026-10-26");
    expect(healthScore({ slaMet: 3, slaBreached: 0, open: 0, criticalHighOpen: 0 }, 0)).toBe(100);
    expect(healthScore({ slaMet: 0, slaBreached: 4, open: 2, criticalHighOpen: 5 }, 2)).toBe(0);
  });

  it("MTTA, MTTR, SLA compliance, validity, money per currency, coverage", () => {
    const facts = [
      fact({}),
      // Missed first response (30h > 24h), still open, critical.
      fact({ severity: "critical", status: "triaging", firstResponseAt: "2026-10-21T06:00:00Z", triagedAt: null, closedAt: null, bountyAwardedMinorUnits: null, bountyPaidMinorUnits: 0, researcherId: "r2", researcherName: "Ben" }),
      // Duplicate, no SLA policy, paid in INR elsewhere.
      fact({ status: "duplicate", firstResponseTargetHours: null, triageTargetHours: null, resolutionTargetDays: null, bountyCurrency: "INR", bountyAwardedMinorUnits: 10000, bountyPaidMinorUnits: 10000, assetId: null, assetLabel: null }),
    ];
    const a = computeAnalytics(facts, [{ assetId: "a1", assetLabel: "app.example.com", assetType: "domain", programNames: ["Web"] }, { assetId: "a2", assetLabel: "api.example.com", assetType: "domain", programNames: ["Web"] }], { from: "2026-10-01", to: "2026-10-28" }, NOW);
    expect(a.kpis.total).toBe(3);
    expect(a.kpis.valid).toBe(1);
    expect(a.kpis.validRate).toBe(50); // 1 valid of 2 closed
    expect(a.kpis.criticalHighOpen).toBe(1);
    expect(a.kpis.mttaHours).toBe(10); // median of 10, 30, 10
    expect(a.kpis.mttrDays).toBe(5);
    // Report 1: 3 met. Report 2: first response missed, triage (72h) missed by now, resolution still running.
    expect(a.kpis.slaMet).toBe(3);
    expect(a.kpis.slaBreached).toBe(2);
    expect(a.kpis.slaCompliance).toBe(60);
    expect(a.kpis.paid).toEqual([{ currency: "USD", minorUnits: 50000 }, { currency: "INR", minorUnits: 10000 }]);
    expect(a.kpis.assetCoverage).toBe(50);
    expect(a.researchers[0].researcherName).toBe("Asha");
    expect(a.programs[0].healthLabel).not.toBe("Healthy");
    expect(a.weekly.reduce((s, w) => s + w.total, 0)).toBe(3);
  });
});

describe("filters", () => {
  it("drops anything malformed and keeps presets and custom dates apart", () => {
    const f = parseAnalyticsFilters({ range: "30", from: "2026-01-01", to: "2026-02-01", program: ["not-a-uuid", "8c6f5b9e-3d1a-4b2c-9e8f-1a2b3c4d5e6f"], severity: "high,bogus", status: ["resolved", "drop table"] }, NOW);
    expect(f.range).toBe("30");
    expect(f.from).toBe("2026-09-29");
    expect(f.to).toBe("2026-10-28");
    expect(f.programIds).toEqual(["8c6f5b9e-3d1a-4b2c-9e8f-1a2b3c4d5e6f"]);
    expect(f.severities).toEqual(["high"]);
    expect(f.statuses).toEqual(["resolved"]);
    const custom = parseAnalyticsFilters({ range: "custom", from: "2026-01-01", to: "2026-02-01" }, NOW);
    expect([custom.from, custom.to, custom.range]).toEqual(["2026-01-01", "2026-02-01", "custom"]);
    // A shared link without range keeps the dates; an inverted or too-long range falls back to 90 days.
    expect(parseAnalyticsFilters(Object.fromEntries(new URLSearchParams(filtersToSearch(custom))), NOW).from).toBe("2026-01-01");
    expect(parseAnalyticsFilters({ range: "custom", from: "2026-03-01", to: "2026-01-01" }, NOW).range).toBe("90");
  });

  it("a schedule covers the previous week or calendar month", () => {
    expect(scheduledFilters({}, "weekly", new Date("2026-10-26T07:00:00Z"))).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    expect(scheduledFilters({ severities: ["critical"] }, "monthly", new Date("2026-11-01T07:00:00Z"))).toMatchObject({ from: "2026-10-01", to: "2026-10-31", severities: ["critical"] });
  });
});

describe("export files", () => {
  const facts = [fact({ title: '=HYPERLINK("http://evil")', researcherName: "Zoë <b>" }), fact({ severity: null, status: "new" })];
  const a = computeAnalytics(facts, [], { from: "2026-10-01", to: "2026-10-28" }, NOW);
  const meta = { organizationName: "Acme & Co", generatedAt: NOW, filterSummary: ["Severity: high"] };

  it("CSV neutralises formulas", () => {
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buildCsv(facts));
    expect(text.startsWith("﻿\"Report id\"")).toBe(true);
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("the workbook is a valid zip with escaped XML and one sheet per table", () => {
    const files = unzipSync(buildWorkbook(a, facts, meta));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet6.xml"]));
    const reports = strFromU8(files["xl/worksheets/sheet2.xml"]);
    expect(reports).toContain("Zoë &lt;b&gt;");
    expect(reports).toContain("&apos;=HYPERLINK".replace("&apos;", "'"));
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Program health"');
    expect(Object.keys(unzipSync(buildXlsx([{ name: "a/b?", header: ["x"], rows: [[1]] }, { name: "a b ", header: ["x"], rows: [] }])))).toHaveLength(7);
  });

  it("the PDF is well formed: header, every object in the xref, page count", () => {
    const bytes = buildExecutivePdf(a, meta);
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(text.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(text).toContain("Acme & Co");
    expect(text).toContain("Zo\xEB"); // Latin-1 kept
  });

  it("file names are safe", () => {
    expect(exportFileName("Acme & Co / Security", "pdf", { from: "2026-10-01", to: "2026-10-28" })).toBe("acme-co-security-security-report-2026-10-01-to-2026-10-28.pdf");
  });
});
