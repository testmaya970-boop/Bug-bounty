import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ASSET_CATEGORIES,
  PROGRAM_BLUEPRINTS,
  STUDIO_ASSET_CATALOG,
  STUDIO_STEPS,
  WELCOME_ENGAGEMENT_OPTIONS,
  calculateReadinessReport,
  calculateRewardForecast,
  calculateScopeTelemetry,
  createInitialStudioState,
} from "./launch-program-studio";

describe("Launch Program Studio pure logic", () => {
  it("defines all 9 guided steps and 4 welcome engagement cards", () => {
    assert.equal(STUDIO_STEPS.length, 9);
    assert.deepEqual(
      STUDIO_STEPS.map((s) => s.id),
      ["welcome", "blueprint", "details", "scope", "rewards", "access", "automation", "review", "launch"],
    );
    assert.equal(WELCOME_ENGAGEMENT_OPTIONS.length, 4);
  });

  it("includes all 10 industry/stack blueprints plus Start Blank", () => {
    assert.equal(PROGRAM_BLUEPRINTS.length, 11);
    assert.equal(ASSET_CATEGORIES.length, 10);
  });

  it("calculates scope telemetry and flags unverified, duplicate, conflict, and missing production warnings", () => {
    // 1. Default verified production scope -> 100% verified, no warnings
    const cleanReport = calculateScopeTelemetry(["asset-dom-1", "asset-api-1", "asset-web-1"], STUDIO_ASSET_CATALOG);
    assert.equal(cleanReport.totalSelected, 3);
    assert.equal(cleanReport.verificationPercent, 100);
    assert.equal(cleanReport.criticalAssetsCount, 3);
    assert.equal(cleanReport.warnings.length, 0);

    // 2. Include unverified staging asset + duplicate apex domain
    const warnReport = calculateScopeTelemetry(
      ["asset-dom-1", "asset-dom-3", "asset-dom-4"],
      STUDIO_ASSET_CATALOG,
    );
    const warningTypes = warnReport.warnings.map((w) => w.type);
    assert.ok(warningTypes.includes("unverified"));
    assert.ok(warningTypes.includes("duplicate"));
    assert.ok(warningTypes.includes("conflict"));

    // 3. Only staging asset -> triggers missing_production warning
    const stagingOnlyReport = calculateScopeTelemetry(["asset-dom-3"], STUDIO_ASSET_CATALOG);
    assert.ok(stagingOnlyReport.warnings.some((w) => w.type === "missing_production"));
  });

  it("calculates reward forecast for paid bounty and VDP modes", () => {
    const state = createInitialStudioState();
    const bountyForecast = calculateRewardForecast(state.rewardMatrix, "Public", 5);
    assert.ok(bountyForecast.averagePayout > 0);
    assert.ok(bountyForecast.estimatedMonthlySpend > 0);
    assert.equal(bountyForecast.competitivenessTier, "Top 10% Market Leader");

    const vdpForecast = calculateRewardForecast(state.rewardMatrix, "VDP", 5);
    assert.equal(vdpForecast.averagePayout, 0);
    assert.equal(vdpForecast.estimatedMonthlySpend, 0);
    assert.equal(vdpForecast.competitivenessTier, "VDP (Recognition Only)");
  });

  it("computes readiness score and checklist items accurately", () => {
    const state = createInitialStudioState();
    const fullReady = calculateReadinessReport(state, STUDIO_ASSET_CATALOG);
    assert.equal(fullReady.score, 100);
    assert.equal(fullReady.gradeLabel, "Launch Ready");
    assert.ok(fullReady.items.every((item) => item.status === "complete"));

    // Disconnect Slack and add unverified DNS asset -> score drops to 96% with 2 warnings
    const partialState = {
      ...state,
      selectedAssetIds: [...state.selectedAssetIds, "asset-dom-3"],
      enabledModuleIds: state.enabledModuleIds.filter((id) => id !== "slack"),
    };
    const partialReport = calculateReadinessReport(partialState, STUDIO_ASSET_CATALOG);
    assert.equal(partialReport.score, 96);
    const warningIds = partialReport.items.filter((i) => i.status === "warning").map((i) => i.id);
    assert.deepEqual(warningIds, ["check-slack", "check-dns"]);
  });
});
