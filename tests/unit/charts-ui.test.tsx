import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart } from "../../components/charts/bar-chart";
import { DonutChart } from "../../components/charts/donut-chart";
import { SegmentedBar } from "../../components/charts/segmented-bar";
import { ReportStatusChart } from "../../components/reports/report-status-chart";
import { statusTone, severityTone } from "../../components/ui/badge";

const GREEN = statusTone.resolved; // { text: "text-success", bg: "bg-success" }
const BLUE = statusTone.new; // { text: "text-info", bg: "bg-info" }

describe("BarChart: a real, dependency-free horizontal bar list", () => {
  it("renders every label and its real value", () => {
    const html = renderToStaticMarkup(<BarChart data={[{ label: "Resolved", value: 4 }, { label: "Rejected", value: 1 }]} />);
    expect(html).toContain("Resolved");
    expect(html).toContain("Rejected");
    expect(html).toContain(">4<");
    expect(html).toContain(">1<");
  });

  it("renders nothing when every value is zero -- a chart of nothing communicates nothing", () => {
    const html = renderToStaticMarkup(<BarChart data={[{ label: "Resolved", value: 0 }]} />);
    expect(html).toBe("");
  });
});

describe("DonutChart: a real SVG ring chart colored from real Tone pairs", () => {
  it("renders the real total in the center and each present segment in the legend", () => {
    const html = renderToStaticMarkup(<DonutChart centerLabel="Resolved reports" data={[{ label: "Critical", value: 2, tone: severityTone.critical }, { label: "Low", value: 1, tone: severityTone.low }]} />);
    expect(html).toContain(">3<"); // the real total, center label
    expect(html).toContain("Critical");
    expect(html).toContain("Low");
    expect(html).toContain(severityTone.critical.text);
    expect(html).toContain(severityTone.critical.bg);
  });

  it("omits a zero-value segment from both the ring and the legend", () => {
    const html = renderToStaticMarkup(<DonutChart centerLabel="Resolved reports" data={[{ label: "Critical", value: 1, tone: severityTone.critical }, { label: "Low", value: 0, tone: severityTone.low }]} />);
    expect(html).toContain("Critical");
    expect(html).not.toContain("Low");
  });

  it("renders nothing when every value is zero", () => {
    const html = renderToStaticMarkup(<DonutChart centerLabel="Resolved reports" data={[{ label: "Critical", value: 0, tone: severityTone.critical }]} />);
    expect(html).toBe("");
  });
});

describe("SegmentedBar: one proportional pipeline bar, not N independently-scaled bars", () => {
  it("renders a literal bg-* class per segment, never a runtime-derived one -- the exact bug this component exists to avoid repeating (see docs/decisions/0046)", () => {
    const html = renderToStaticMarkup(<SegmentedBar data={[{ label: "New", value: 1, tone: BLUE }, { label: "Resolved", value: 3, tone: GREEN }]} />);
    expect(html).toContain("bg-info");
    expect(html).toContain("bg-success");
  });

  it("computes a real percentage per segment from the real total, not a fabricated one", () => {
    const html = renderToStaticMarkup(<SegmentedBar data={[{ label: "New", value: 1, tone: BLUE }, { label: "Resolved", value: 3, tone: GREEN }]} />);
    expect(html).toContain("25%");
    expect(html).toContain("75%");
  });

  it("excludes a zero-value category from the bar and the legend entirely -- never a hollow segment or a '0%' row", () => {
    const html = renderToStaticMarkup(<SegmentedBar data={[{ label: "New", value: 1, tone: BLUE }, { label: "Rejected", value: 0, tone: statusTone.rejected }]} />);
    expect(html).toContain("New");
    expect(html).not.toContain("Rejected");
  });

  it("renders nothing when every value is zero", () => {
    const html = renderToStaticMarkup(<SegmentedBar data={[{ label: "New", value: 0, tone: BLUE }]} />);
    expect(html).toBe("");
  });
});

describe("ReportStatusChart: the researcher's own real current work mix", () => {
  it("shows the real total report count and every nonzero status with its real count and percentage", () => {
    const html = renderToStaticMarkup(
      <ReportStatusChart
        counts={[
          { status: "new", count: 1 },
          { status: "resolved", count: 3 },
        ]}
      />,
    );
    expect(html).toContain("4 reports");
    expect(html).toContain("New");
    expect(html).toContain("Resolved");
    expect(html).toContain("25%");
    expect(html).toContain("75%");
  });

  it("uses singular phrasing for exactly one report", () => {
    const html = renderToStaticMarkup(<ReportStatusChart counts={[{ status: "new", count: 1 }]} />);
    expect(html).toContain("1 report");
    expect(html).not.toContain("1 reports");
  });
});
