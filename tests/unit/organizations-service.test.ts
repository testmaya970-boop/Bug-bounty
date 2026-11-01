import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeClient = { query: vi.fn() };

vi.mock("@/lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/pool")>("@/lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ id: "actor-1", platformRole: null, username: "actor", displayName: "Actor", email: null }) }));

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("organizations service: createOrganization", () => {
  it("calls create_organization with org_name and the client-generated idempotency key, never a creator/owner param", async () => {
    let capturedSql = "";
    let captured: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      captured = params;
      return queryReturning([{ id: "org-1", slug: "acme-security", name: "Acme Security", created_by: "actor-1", status: "active", idempotency_key: "key-1" }]);
    });
    const { createOrganization } = await import("../../services/organizations");

    const result = await createOrganization("Acme Security", "key-1");

    expect(capturedSql).toContain("create_organization");
    expect(captured).toEqual(["Acme Security", "key-1"]);
    expect(result).toEqual({ id: "org-1", slug: "acme-security", name: "Acme Security", role: "owner", status: "active" });
  });

  it("maps INVALID_NAME and SLUG_GENERATION_FAILED into typed, code-discriminated errors", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("INVALID_NAME: Enter an organization name.");
    });
    const { createOrganization } = await import("../../services/organizations");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await createOrganization("").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_NAME");
  });

  it("does not leak a raw database error for an unrecognized failure", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('duplicate key value violates unique constraint "organizations_slug_key"');
    });
    const { createOrganization } = await import("../../services/organizations");
    const { OrganizationServiceError } = await import("../../services/rpc-error");

    const error: unknown = await createOrganization("Acme").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("organizations service: listMyPendingInvitations", () => {
  it("maps the RPC row shape (including the joined organization_name) into camelCase records", async () => {
    const row = { id: "invite-1", organization_id: "org-1", organization_name: "Acme Security", role: "triager", invited_by_name: "Alice", expires_at: "2026-09-02T00:00:00Z", created_at: "2026-08-26T00:00:00Z" };
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([row]);
    });
    const { listMyPendingInvitations } = await import("../../services/organizations");

    const [invitation] = await listMyPendingInvitations();
    expect(capturedSql).toContain("list_my_pending_invitations");
    expect(invitation).toEqual({ id: "invite-1", organizationId: "org-1", organizationName: "Acme Security", role: "triager", invitedByName: "Alice", expiresAt: "2026-09-02T00:00:00Z", createdAt: "2026-08-26T00:00:00Z" });
  });
});
