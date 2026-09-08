import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/current-user";

// Same "mock the thin data-access layer, exercise the action's/service's own logic for
// real" pattern as tests/unit/reports-pagination-actions.test.ts and
// tests/unit/report-triage-service.test.ts. This file specifically exercises the Server
// Action layer (actions/reports.ts), not just the service underneath it -- proving an
// invalid state transition rejected by the database (private.is_valid_report_transition,
// see db/migrations/202608270002_report_triage_foundation.sql) surfaces correctly through
// toResult's OrganizationServiceError mapping all the way out to the typed ActionResult a
// client component actually reads, not just that services/reports.ts itself throws.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockedGetCurrentUser = vi.mocked(getCurrentUser);

const VALID_ORG_ID = "11111111-1111-4111-8111-111111111111";
const VALID_PROGRAM_ID = "22222222-2222-4222-8222-222222222222";
const VALID_REPORT_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  fakeClient.query.mockReset();
  mockedGetCurrentUser.mockReset();
  mockedGetCurrentUser.mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null });
});

/**
 * There is no single generic updateReportStateAction in this codebase -- each real
 * transition is its own named Server Action (acceptReportAction, resolveReportAction,
 * markDuplicateAction, ...), each calling its own single-purpose RPC
 * (accept_report/resolve_report/mark_duplicate/...), each of which independently
 * re-validates the CURRENT status against private.is_valid_report_transition before
 * applying the change -- the database is the one place this rule is enforced, never
 * duplicated in application code. acceptReportAction is exercised here as the
 * representative case (attempting to accept an already-terminal, e.g. already-rejected,
 * report); tests/unit/report-triage-service.test.ts's own "triage mutation error mapping"
 * describe block already covers the identical rejection for every other transition RPC at
 * the service layer -- this file's job is confirming the SAME rejection survives the
 * additional Server Action/toResult layer intact.
 */
describe("acceptReportAction: rejects an invalid state transition", () => {
  it("returns INVALID_TRANSITION (never a raw SQLSTATE, never a silently-swallowed error) when the database rejects accepting an already-terminal report", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw { message: "INVALID_TRANSITION: this report cannot be accepted from its current state" };
    });
    const { acceptReportAction } = await import("../../actions/reports");

    const result = await acceptReportAction({ organizationId: VALID_ORG_ID, programId: VALID_PROGRAM_ID, reportId: VALID_REPORT_ID });

    expect(result).toEqual({ ok: false, code: "INVALID_TRANSITION", message: "this report cannot be accepted from its current state" });
  });

  it("rejects a non-uuid reportId as INVALID_INPUT before ever reaching the database", async () => {
    const { acceptReportAction } = await import("../../actions/reports");

    const result = await acceptReportAction({ organizationId: VALID_ORG_ID, programId: VALID_PROGRAM_ID, reportId: "not-a-uuid" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Check the form and try again." });
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("succeeds and returns the updated report when the transition is valid", async () => {
    const acceptedRow = {
      id: VALID_REPORT_ID,
      program_id: VALID_PROGRAM_ID,
      organization_id: VALID_ORG_ID,
      researcher_id: "researcher-1",
      researcher_display_name: "Researcher",
      title: "IDOR",
      description: "Body",
      asset_type: "url",
      target: "https://api.example.com/admin",
      display_target: "https://api.example.com/admin",
      matched_scope_entry_id: "entry-1",
      matched_scope_state: "in_scope",
      matched_target: "https://api.example.com/admin",
      status: "accepted",
      confirmed_severity: null,
      duplicate_of_report_id: null,
      resolution_summary: null,
      weakness_type: null,
      impact: null,
      researcher_severity: null,
      cvss_attack_vector: null,
      cvss_attack_complexity: null,
      cvss_privileges_required: null,
      cvss_user_interaction: null,
      cvss_scope: null,
      cvss_confidentiality_impact: null,
      cvss_integrity_impact: null,
      cvss_availability_impact: null,
      cvss_base_score: null,
      submitted_at: "2026-08-27T00:00:00Z",
      created_at: "2026-08-27T00:00:00Z",
      updated_at: "2026-08-27T00:00:00Z",
    };
    fakeClient.query.mockResolvedValue({ rows: [acceptedRow], rowCount: 1 });
    const { acceptReportAction } = await import("../../actions/reports");

    const result = await acceptReportAction({ organizationId: VALID_ORG_ID, programId: VALID_PROGRAM_ID, reportId: VALID_REPORT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("accepted");
  });
});
