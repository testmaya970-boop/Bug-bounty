import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvssSummary } from "../../components/reports/cvss-summary";
import type { CvssMetrics } from "../../types/report";

const METRICS: CvssMetrics = {
  attackVector: "network",
  attackComplexity: "low",
  privilegesRequired: "none",
  userInteraction: "none",
  scope: "unchanged",
  confidentialityImpact: "high",
  integrityImpact: "high",
  availabilityImpact: "high",
};

describe("CvssSummary: the base score's own color reuses the existing severity color system, never a second mapping", () => {
  it("renders a critical-range score (>= 9) in the same tone SeverityBadge uses for 'critical'", () => {
    const html = renderToStaticMarkup(<CvssSummary metrics={METRICS} baseScore={9.8} />);
    expect(html).toContain("9.8");
    expect(html).toContain("Critical");
    expect(html).toMatch(/text-severity-critical/);
  });

  it("renders a low-range score in a visibly different tone than a critical one, never the same class", () => {
    const lowHtml = renderToStaticMarkup(<CvssSummary metrics={METRICS} baseScore={2.1} />);
    expect(lowHtml).toContain("2.1");
    expect(lowHtml).toContain("Low");
    expect(lowHtml).toMatch(/text-severity-low/);
    expect(lowHtml).not.toMatch(/text-severity-critical/);
  });

  it("still shows the real numeric score and text label regardless of color -- color reinforces, never replaces, the label", () => {
    const html = renderToStaticMarkup(<CvssSummary metrics={METRICS} baseScore={5.4} />);
    expect(html).toContain("5.4");
    expect(html).toContain("Medium");
  });
});
