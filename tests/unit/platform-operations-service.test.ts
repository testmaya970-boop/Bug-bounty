import { beforeEach, describe, expect, it, vi } from "vitest";

// services/platform-operations.ts's data-access boundary is lib/db/pool.ts's
// withActorTransaction/withServiceRoleTransaction/callRpc -- mocked here at that boundary,
// same "mock the thin data-access layer, exercise the service's own logic for real" pattern
// used across the native-Postgres migration's test suite. A fake PoolClient's `.query` is a
// controllable mock so each test scripts exactly the rows a real query would have returned.
const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
    withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));
// approveProgramLaunch delegates to services/programs.ts's activateProgram -- stub it so this
// suite exercises only platform-operations.ts's own logic, not activateProgram's.
vi.mock("@/services/programs", () => ({ activateProgram: vi.fn() }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("isPlatformAdmin: fails closed, never open, on any ambiguity", () => {
  it("returns true only when the RPC returns exactly true", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ am_i_platform_admin: true }]));
    const { isPlatformAdmin } = await import("../../services/platform-operations");

    await expect(isPlatformAdmin()).resolves.toBe(true);
  });

  it("returns false when the RPC returns false", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([{ am_i_platform_admin: false }]));
    const { isPlatformAdmin } = await import("../../services/platform-operations");

    await expect(isPlatformAdmin()).resolves.toBe(false);
  });

  it("returns false -- never throws, never assumes admin -- when the RPC itself errors", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("connection reset");
    });
    const { isPlatformAdmin } = await import("../../services/platform-operations");

    await expect(isPlatformAdmin()).resolves.toBe(false);
  });
});

describe("listNeedsRecoveryOutboxEvents: maps every column, never inflates the row shape", () => {
  it("maps a dead-lettered event row to camelCase, preserving every field including a null lastError", async () => {
    const row = {
      id: "event-1",
      event_type: "report.created",
      aggregate_type: "report",
      aggregate_id: "report-1",
      organization_id: "org-1",
      organization_name: "Acme Security",
      attempts: 5,
      max_attempts: 5,
      last_error: null,
      occurred_at: "2026-08-30T00:00:00Z",
      processed_at: "2026-08-30T00:05:00Z",
    };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listNeedsRecoveryOutboxEvents } = await import("../../services/platform-operations");

    const result = await listNeedsRecoveryOutboxEvents();

    expect(result).toEqual([
      {
        id: "event-1",
        eventType: "report.created",
        aggregateType: "report",
        aggregateId: "report-1",
        organizationId: "org-1",
        organizationName: "Acme Security",
        attempts: 5,
        maxAttempts: 5,
        lastError: null,
        occurredAt: "2026-08-30T00:00:00Z",
        processedAt: "2026-08-30T00:05:00Z",
      },
    ]);
  });

  it("propagates a FORBIDDEN rejection (a non-admin caller) as a typed service error, never a raw message", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: platform admin authority required");
    });
    const { listNeedsRecoveryOutboxEvents } = await import("../../services/platform-operations");

    const error: unknown = await listNeedsRecoveryOutboxEvents().catch((thrown) => thrown);

    expect((error as { code: string }).code).toBe("FORBIDDEN");
  });
});

describe("listNeedsRecoveryPaymentAttempts: never selects amount/currency/researcher -- structurally cannot leak them", () => {
  it("the mapped shape has no amount, currency, or researcher field even if the mocked row includes one", async () => {
    const rowWithExtraFields = {
      id: "attempt-1",
      payment_obligation_id: "obligation-1",
      organization_id: "org-1",
      organization_name: "Acme Security",
      program_id: "program-1",
      program_name: "Bug Bounty",
      report_id: "report-1",
      provider: "manual",
      failure_code: "insufficient_funds",
      failure_message: "The organization's payout account has insufficient funds.",
      attempt_number: 1,
      started_at: "2026-08-30T00:00:00Z",
      completed_at: "2026-08-30T00:01:00Z",
      amount_minor_units: 500000,
      researcher_id: "researcher-1",
    };
    fakeClient.query.mockImplementation(async () => queryReturning([rowWithExtraFields]));
    const { listNeedsRecoveryPaymentAttempts } = await import("../../services/platform-operations");

    const [mapped] = await listNeedsRecoveryPaymentAttempts();

    expect(mapped).not.toHaveProperty("amountMinorUnits");
    expect(mapped).not.toHaveProperty("researcherId");
    expect(mapped.failureMessage).toBe("The organization's payout account has insufficient funds.");
  });
});

describe("replayDeadLetteredOutboxEvent: a thin RPC call, no client-side retry logic to duplicate the database's own safety", () => {
  it("calls the RPC with the event id and reason, and resolves on success", async () => {
    let capturedSql = "";
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      captured = params;
      return queryReturning([{}]);
    });
    const { replayDeadLetteredOutboxEvent } = await import("../../services/platform-operations");

    await replayDeadLetteredOutboxEvent("event-1", "manual replay after fixing the bug");

    expect(capturedSql).toContain("replay_dead_lettered_outbox_event");
    expect(captured).toEqual(["event-1", "manual replay after fixing the bug"]);
  });

  it("surfaces EVENT_NOT_DEAD_LETTER as a typed error -- e.g. a second concurrent replay attempt", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("EVENT_NOT_DEAD_LETTER: only a dead-lettered event can be replayed");
    });
    const { replayDeadLetteredOutboxEvent } = await import("../../services/platform-operations");

    const error: unknown = await replayDeadLetteredOutboxEvent("event-1").catch((thrown) => thrown);

    expect((error as { code: string }).code).toBe("EVENT_NOT_DEAD_LETTER");
  });
});

describe("findUserIdByUsername: uses withServiceRoleTransaction with plain SQL, not an RPC", () => {
  it("queries public.users by username and maps is_suspended to isSuspended", async () => {
    let capturedSql = "";
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      captured = params;
      return queryReturning([{ id: "user-1", is_suspended: true }]);
    });
    const { findUserIdByUsername } = await import("../../services/platform-operations");

    const result = await findUserIdByUsername("some-researcher");

    expect(capturedSql).toContain("public.users");
    expect(captured).toEqual(["some-researcher"]);
    expect(result).toEqual({ id: "user-1", isSuspended: true });
  });

  it("returns null when no user matches the username", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { findUserIdByUsername } = await import("../../services/platform-operations");

    const result = await findUserIdByUsername("nobody");

    expect(result).toBeNull();
  });
});

describe("findOrganizationIdBySlug: uses withServiceRoleTransaction with plain SQL, not an RPC", () => {
  it("queries public.organizations by slug and maps id/name", async () => {
    let capturedSql = "";
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      captured = params;
      return queryReturning([{ id: "org-1", name: "Acme Security" }]);
    });
    const { findOrganizationIdBySlug } = await import("../../services/platform-operations");

    const result = await findOrganizationIdBySlug("acme-security");

    expect(capturedSql).toContain("public.organizations");
    expect(captured).toEqual(["acme-security"]);
    expect(result).toEqual({ id: "org-1", name: "Acme Security" });
  });

  it("returns null when no organization matches the slug", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { findOrganizationIdBySlug } = await import("../../services/platform-operations");

    const result = await findOrganizationIdBySlug("nonexistent");

    expect(result).toBeNull();
  });
});
