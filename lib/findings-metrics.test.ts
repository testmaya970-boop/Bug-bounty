import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFindingsOverviewMetrics,
  getFindingTechnicalEnrichment,
} from "./findings-metrics";

test("computeFindingsOverviewMetrics aggregates open, critical, and resolved counts accurately", () => {
  const metrics = computeFindingsOverviewMetrics([
    { status: "new", confirmedSeverity: "critical", researcherSeverity: "critical" },
    { status: "triaging", confirmedSeverity: "critical", researcherSeverity: "critical" },
    { status: "accepted", confirmedSeverity: "high", researcherSeverity: "high" },
    { status: "resolved", confirmedSeverity: "critical", researcherSeverity: "critical" },
    { status: "duplicate", confirmedSeverity: "medium", researcherSeverity: "medium" },
  ]);

  assert.equal(metrics.totalCount, 5);
  assert.equal(metrics.openCount, 3);
  assert.equal(metrics.criticalOpenCount, 2);
  assert.equal(metrics.highOpenCount, 1);
  assert.equal(metrics.needsTriageCount, 2);
  assert.equal(metrics.resolvedCount, 1);
  assert.equal(metrics.severityCounts.critical, 3);
  assert.equal(metrics.severityCounts.high, 1);
  assert.equal(metrics.severityCounts.medium, 1);
});

test("getFindingTechnicalEnrichment returns deterministic CWE, CVSS vector, and HTTP PoC", () => {
  const enrichment = getFindingTechnicalEnrichment({
    id: "77777777-7777-4777-8777-777777777704",
    title: "SSRF in webhook delivery preview via DNS rebinding",
    weaknessType: "ssrf",
    displayTarget: "https://api.northwind.cloud/v2/webhooks/test-delivery",
    confirmedSeverity: "critical",
    researcherSeverity: "critical",
    cvssBaseScore: 9.1,
    status: "triaging",
  });

  assert.equal(enrichment.cweId, "CWE-918");
  assert.equal(enrichment.cvssScore, 9.1);
  assert.ok(enrichment.cvssVector.startsWith("CVSS:3.1/"));
  assert.ok(enrichment.httpRequestPoc.includes("POST /v2/webhooks/preview-delivery"));
  assert.ok(enrichment.reproductionSteps.length >= 3);
});
