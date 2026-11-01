import test from "node:test";
import assert from "node:assert/strict";
import {
  HERO_PIPELINE_STEPS,
  DEFAULT_TRIAGE_STATUS,
  KPI_OVERVIEW_CARDS,
  INITIAL_LIVE_QUEUE_REPORTS,
  QUEUE_SEVERITY_DISTRIBUTION,
  TRIAGE_PIPELINE_STAGES,
  TODAY_ANALYST_PERFORMANCE,
  ANALYST_TEAM_PROFILES,
  SERVICE_PLANS,
  PLAN_COMPARISON_MATRIX,
  COVERAGE_COMPARISON,
  CUSTOMER_OUTCOMES,
  WORKFLOW_TIMELINE_STEPS,
  TRIAGE_FAQ_ITEMS,
  getServicePlanById,
  filterLiveQueueReports,
  computeEffectiveTriageStatus,
} from "./managed-triage-soc";

test("Hero pipeline has all 7 required operational stages in exact order", () => {
  assert.deepEqual(
    HERO_PIPELINE_STEPS.map((s) => s.label),
    [
      "Report",
      "Validation",
      "Reproduction",
      "Severity",
      "Duplicate Detection",
      "Engineering Ready",
      "Your Decision",
    ],
  );
});

test("Organization triage status defaults match operational metrics", () => {
  assert.equal(DEFAULT_TRIAGE_STATUS.statusLabel, "Not Enabled");
  assert.equal(DEFAULT_TRIAGE_STATUS.reportsWaiting, 14);
  assert.equal(DEFAULT_TRIAGE_STATUS.averageResponse, "31h");
  assert.equal(DEFAULT_TRIAGE_STATUS.criticalWaiting, 2);
  assert.equal(DEFAULT_TRIAGE_STATUS.researcherMessages, 6);
  assert.equal(DEFAULT_TRIAGE_STATUS.estimatedEngineerHoursSavedPerMonth, 42);
});

test("KPI overview includes all 6 cards with sparklines and exact values", () => {
  assert.equal(KPI_OVERVIEW_CARDS.length, 6);
  const byLabel = Object.fromEntries(KPI_OVERVIEW_CARDS.map((c) => [c.label, c.value]));
  assert.equal(byLabel["Open Reports"], "14");
  assert.equal(byLabel["Critical Queue"], "2");
  assert.equal(byLabel["Duplicate Prevention"], "23%");
  assert.equal(byLabel["Average Validation"], "18 min");
  assert.equal(byLabel["Severity Accuracy"], "98%");
  assert.equal(byLabel["Researcher Satisfaction"], "97%");
  for (const card of KPI_OVERVIEW_CARDS) {
    assert.ok(card.sparkline.length >= 5, `Sparkline missing on ${card.id}`);
  }
});

test("Live queue distribution and filtering work across severities and pipeline stages", () => {
  assert.deepEqual(
    QUEUE_SEVERITY_DISTRIBUTION.map((d) => [d.label, d.blocks]),
    [
      ["Critical", 3],
      ["High", 6],
      ["Medium", 4],
      ["Low", 2],
    ],
  );
  const criticalOnly = filterLiveQueueReports(INITIAL_LIVE_QUEUE_REPORTS, "critical");
  assert.equal(criticalOnly.length, 2);
  assert.equal(criticalOnly[0].vulnerabilityType, "SSRF");
  assert.equal(criticalOnly[0].assignedAnalyst, "Sarah");

  const reproOnly = filterLiveQueueReports(INITIAL_LIVE_QUEUE_REPORTS, "all", "reproduction");
  assert.equal(reproOnly.length, 2);
});

test("Triage pipeline stages and today analyst performance match specification", () => {
  assert.deepEqual(
    TRIAGE_PIPELINE_STAGES.map((s) => [s.label, s.count]),
    [
      ["Submitted", 28],
      ["Validation", 18],
      ["Reproduction", 14],
      ["Duplicate Check", 6],
      ["Severity Review", 5],
      ["Ready For Organization", 4],
    ],
  );
  const perfMap = Object.fromEntries(TODAY_ANALYST_PERFORMANCE.map((m) => [m.label, m.value]));
  assert.equal(perfMap["Reports Validated"], "18");
  assert.equal(perfMap["Average Response"], "17 min");
  assert.equal(perfMap["Duplicate Rate"], "26%");
  assert.equal(perfMap["Severity Accuracy"], "99%");
  assert.equal(perfMap["Researcher Replies"], "41");
});

test("Analyst team profiles and service plans cover all required fields", () => {
  assert.deepEqual(
    ANALYST_TEAM_PROFILES.map((a) => a.name),
    ["Sarah", "David", "Emily"],
  );
  assert.equal(SERVICE_PLANS.length, 3);
  const enterprise = getServicePlanById("enterprise");
  assert.equal(enterprise.highlighted, true);
  assert.equal(getServicePlanById("business").monthlyPriceFormatted, "$2,500/month");
  assert.equal(PLAN_COMPARISON_MATRIX.length, 11);
  assert.equal(COVERAGE_COMPARISON.withoutManaged.metrics.length, 4);
  assert.equal(COVERAGE_COMPARISON.withManaged.metrics.length, 6);
  assert.equal(CUSTOMER_OUTCOMES.length, 5);
  assert.equal(WORKFLOW_TIMELINE_STEPS.length, 10);
  assert.equal(TRIAGE_FAQ_ITEMS.length, 6);
});

test("computeEffectiveTriageStatus transitions cleanly between Not Enabled and Enabled", () => {
  const disabled = computeEffectiveTriageStatus(DEFAULT_TRIAGE_STATUS, false, "business");
  assert.equal(disabled.statusLabel, "Not Enabled");
  assert.equal(disabled.estimatedEngineerHoursSavedPerMonth, 42);

  const enabledEnterprise = computeEffectiveTriageStatus(DEFAULT_TRIAGE_STATUS, true, "enterprise");
  assert.equal(enabledEnterprise.statusLabel, "Enabled");
  assert.equal(enabledEnterprise.criticalWaiting, 0);
  assert.equal(enabledEnterprise.estimatedEngineerHoursSavedPerMonth, 86);
});
