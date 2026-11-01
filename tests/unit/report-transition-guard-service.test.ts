import { describe, expect, it } from "vitest";
import { isValidReportTransition, assertValidReportTransition } from "@/services/reports";
import { OrganizationServiceError } from "@/services/rpc-error";
import { REPORT_STATUS_TRANSITIONS } from "@/lib/report-status";
import type { ReportStatus } from "@/types/report";

// Phase 5.5 guard layering: services/reports.ts is the single source of truth for "is
// this a legal report-status transition" -- this file tests THAT function directly
// (isValidReportTransition/assertValidReportTransition), complementing
// tests/unit/report-triage-actions.test.ts (which exercises the SAME rejection at the
// Server Action layer, one level up, via a real acceptReportAction call against a mocked
// database) and tests/unit/report-triage-service.test.ts's own "triage mutation error
// mapping" describe block (which exercises the database's own INVALID_TRANSITION
// rejection surfacing through mapError, for every one of the 8 real RPC-backed mutation
// functions). Three layers, three different things actually verified: the pure decision
// function itself (here), the Server Action's error-mapping contract (report-triage-
// actions.test.ts), and the real RPC-call error-mapping contract (report-triage-
// service.test.ts) -- not three copies of the same assertion.
const ALL_STATUSES: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];

describe("services/reports: isValidReportTransition", () => {
  it("matches REPORT_STATUS_TRANSITIONS exactly for every (from, to) pair -- the guard function is not a second, independently-drifting table", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(isValidReportTransition(from, to)).toBe(REPORT_STATUS_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("allows a real, legal transition (new -> triaging)", () => {
    expect(isValidReportTransition("new", "triaging")).toBe(true);
  });

  it("rejects transitioning FROM a terminal state back to an earlier one -- the exact case named in the original ask (cannot go from a terminal status like 'rejected' back to 'new')", () => {
    expect(isValidReportTransition("rejected", "new")).toBe(false);
    expect(isValidReportTransition("resolved", "new")).toBe(false);
    expect(isValidReportTransition("duplicate", "triaging")).toBe(false);
  });

  it("rejects every transition out of every terminal status -- a terminal status has zero legal outgoing transitions, to any status including itself", () => {
    const terminalStatuses: ReportStatus[] = ["resolved", "duplicate", "informative", "not_applicable", "rejected"];
    for (const from of terminalStatuses) {
      for (const to of ALL_STATUSES) {
        expect(isValidReportTransition(from, to)).toBe(false);
      }
    }
  });

  it("rejects a status transitioning to itself (no-op transitions are never legal, matching REPORT_STATUS_TRANSITIONS' own shape -- every array excludes its own key)", () => {
    for (const status of ALL_STATUSES) {
      expect(isValidReportTransition(status, status)).toBe(false);
    }
  });
});

describe("services/reports: assertValidReportTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertValidReportTransition("accepted", "resolved")).not.toThrow();
  });

  it("throws OrganizationServiceError with code INVALID_TRANSITION for an illegal transition -- the identical code the database itself raises, so a caller catching this sees the same contract either way", () => {
    let caught: unknown;
    try {
      assertValidReportTransition("rejected", "new");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrganizationServiceError);
    expect((caught as OrganizationServiceError).code).toBe("INVALID_TRANSITION");
  });
});
