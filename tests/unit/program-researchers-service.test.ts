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

describe("program-researchers service: error mapping", () => {
  const cases: { name: string; message: string; expectedCode: string; call: (services: typeof import("../../services/program-researchers")) => Promise<unknown> }[] = [
    { name: "invite forbidden", message: "FORBIDDEN: actor cannot invite researchers to this program", expectedCode: "FORBIDDEN", call: (s) => s.inviteResearcher({ programId: "prog-1", email: "a@b.com" }) },
    { name: "invitation pending", message: "INVITATION_PENDING: an invitation is already pending for this email", expectedCode: "INVITATION_PENDING", call: (s) => s.inviteResearcher({ programId: "prog-1", email: "a@b.com" }) },
    { name: "email mismatch (token accept)", message: "INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address", expectedCode: "INVITATION_EMAIL_MISMATCH", call: (s) => s.acceptProgramInvitation("some-token") },
    { name: "email mismatch (accept by id)", message: "INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address", expectedCode: "INVITATION_EMAIL_MISMATCH", call: (s) => s.acceptProgramInvitationById("invite-1") },
    { name: "researcher not found (suspend)", message: "RESEARCHER_NOT_FOUND: active participation not found", expectedCode: "RESEARCHER_NOT_FOUND", call: (s) => s.suspendResearcher({ programId: "prog-1", targetUserId: "user-9" }) },
    { name: "researcher not suspended (reinstate)", message: "RESEARCHER_NOT_SUSPENDED: researcher is not currently suspended", expectedCode: "RESEARCHER_NOT_SUSPENDED", call: (s) => s.reinstateResearcher({ programId: "prog-1", targetUserId: "user-9" }) },
    { name: "auth required (revoke)", message: "AUTH_REQUIRED: authentication required", expectedCode: "AUTH_REQUIRED", call: (s) => s.revokeResearcher({ programId: "prog-1", targetUserId: "user-9" }) },
  ];

  for (const { name, message, expectedCode, call } of cases) {
    it(`${name} -> ${expectedCode}`, async () => {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const services = await import("../../services/program-researchers");

      const error: unknown = await call(services).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(services.OrganizationServiceError);
      expect((error as InstanceType<typeof services.OrganizationServiceError>).code).toBe(expectedCode);
    });
  }

  it("does not leak a raw, unrecognized database error to the caller", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('duplicate key value violates unique constraint "program_invitations_pending_unique"');
    });
    const { inviteResearcher, OrganizationServiceError } = await import("../../services/program-researchers");

    const error: unknown = await inviteResearcher({ programId: "prog-1", email: "a@b.com" }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });
});

describe("program-researchers service: cross-program access", () => {
  it("a manager acting on program A surfaces FORBIDDEN when they have no relationship to it, and A's id reaches the RPC unmodified", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("suspend_program_researcher")) {
        capturedArgs = params;
        throw new Error("FORBIDDEN: actor cannot manage researchers for this program");
      }
      return queryReturning([]);
    });
    const { suspendResearcher, OrganizationServiceError } = await import("../../services/program-researchers");

    const error: unknown = await suspendResearcher({ programId: "prog-A", targetUserId: "user-1" }).catch((thrown) => thrown);

    expect(capturedArgs?.[0]).toBe("prog-A");
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });
});

describe("program-researchers service: RPC call shape", () => {
  it("invites with a hashed token, never the raw one, and returns the raw token to the caller once", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("invite_researcher_to_program")) {
        capturedArgs = params;
        return queryReturning([
          { id: "invite-1", program_id: "prog-1", organization_id: "org-1", email: "a@b.com", invited_by: "actor-1", message: null, expires_at: "2026-09-02T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { inviteResearcher } = await import("../../services/program-researchers");
    const { hashInvitationToken } = await import("../../services/invitations");

    const { token, invitation } = await inviteResearcher({ programId: "prog-1", email: "A@B.com" });

    expect(capturedArgs?.[0]).toBe("prog-1");
    expect(capturedArgs?.[1]).toBe("A@B.com");
    expect(capturedArgs?.[3]).toBe(hashInvitationToken(token));
    expect(capturedArgs?.[3]).not.toBe(token);
    expect(invitation.id).toBe("invite-1");
  });

  it("suspend/reinstate/revoke pass only target_program_id and target_user_id, never a client-supplied actor id", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("suspend_program_researcher")) {
        capturedArgs = params;
        return queryReturning([
          { program_id: "prog-1", organization_id: "org-1", user_id: "user-2", status: "suspended", source: "invitation", invited_by: null, joined_at: "2026-08-01T00:00:00Z", suspended_at: "2026-08-26T00:00:00Z", revoked_at: null, updated_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { suspendResearcher } = await import("../../services/program-researchers");

    const result = await suspendResearcher({ programId: "prog-1", targetUserId: "user-2" });

    expect(capturedArgs).toEqual(["prog-1", "user-2"]);
    expect(result.status).toBe("suspended");
  });

  it("accepts by invitation id with no token at all -- authorization is the email-match check inside the RPC, not a client secret", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("accept_program_invitation_by_id")) {
        capturedArgs = params;
        return queryReturning([
          { program_id: "prog-1", organization_id: "org-1", user_id: "user-3", status: "active", source: "invitation", invited_by: "owner-1", joined_at: "2026-08-26T00:00:00Z", suspended_at: null, revoked_at: null, updated_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { acceptProgramInvitationById } = await import("../../services/program-researchers");

    const result = await acceptProgramInvitationById("invite-1");

    expect(capturedArgs).toEqual(["invite-1"]);
    expect(result.status).toBe("active");
  });
});

describe("program-researchers service: researcher self-service reads", () => {
  it("maps the pending-invitations RPC row shape (including joined program/organization names) into camelCase records", async () => {
    const row = { id: "invite-1", program_id: "prog-1", program_name: "Acme Bounty", organization_name: "Acme Security", invited_by_name: "Alice", expires_at: "2026-09-02T00:00:00Z", created_at: "2026-08-26T00:00:00Z" };
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([row]);
    });
    const { listMyPendingProgramInvitations } = await import("../../services/program-researchers");

    const [invitation] = await listMyPendingProgramInvitations();
    expect(capturedSql).toContain("list_my_pending_program_invitations");
    expect(invitation).toEqual({ id: "invite-1", programId: "prog-1", programName: "Acme Bounty", organizationName: "Acme Security", invitedByName: "Alice", expiresAt: "2026-09-02T00:00:00Z", createdAt: "2026-08-26T00:00:00Z" });
  });

  it("maps the participations RPC row shape into camelCase records with a usable organizationId", async () => {
    const row = { program_id: "prog-1", organization_id: "org-1", program_name: "Acme Bounty", program_status: "draft", organization_name: "Acme Security", status: "active", joined_at: "2026-08-26T00:00:00Z" };
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([row]);
    });
    const { listMyProgramParticipations } = await import("../../services/program-researchers");

    const [participation] = await listMyProgramParticipations();
    expect(capturedSql).toContain("list_my_program_participations");
    expect(participation).toEqual({ programId: "prog-1", organizationId: "org-1", programName: "Acme Bounty", programStatus: "draft", organizationName: "Acme Security", status: "active", joinedAt: "2026-08-26T00:00:00Z" });
  });
});

describe("program-researchers service: reads", () => {
  it("maps a joined researcher row (profile embed) into the flat ProgramResearcherRecord shape", async () => {
    const row = {
      program_id: "prog-1",
      organization_id: "org-1",
      user_id: "user-1",
      status: "active",
      source: "invitation",
      invited_by: "owner-1",
      joined_at: "2026-08-01T00:00:00Z",
      suspended_at: null,
      revoked_at: null,
      updated_at: "2026-08-01T00:00:00Z",
      username: "researcher1",
      display_name: "Researcher One",
      email: "researcher1@example.com",
    };
    fakeClient.query.mockImplementation(async () => queryReturning([row]));
    const { listProgramResearchers } = await import("../../services/program-researchers");

    const [researcher] = await listProgramResearchers("prog-1");
    expect(researcher).toMatchObject({ userId: "user-1", displayName: "Researcher One", email: "researcher1@example.com", status: "active" });
  });

  it("returns null from getMyParticipation when no row exists for the given userId", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getMyParticipation } = await import("../../services/program-researchers");

    expect(await getMyParticipation("user-1", "prog-1")).toBeNull();
  });
});
