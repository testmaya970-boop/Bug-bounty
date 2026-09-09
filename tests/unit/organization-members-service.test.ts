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

describe("organization-members service: error mapping", () => {
  it("maps a CODE: message exception into a typed, code-discriminated error", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("FORBIDDEN: actor cannot invite members to this organization");
    });
    const { inviteMember, OrganizationServiceError } = await import("../../services/organization-members");

    const error: unknown = await inviteMember({ organizationId: "org-1", email: "a@b.com", role: "triager" }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "actor cannot invite members to this organization" });
  });

  it("does not leak a raw, unrecognized database error to the caller", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error('duplicate key value violates unique constraint "organization_invitations_pkey"');
    });
    const { inviteMember, OrganizationServiceError } = await import("../../services/organization-members");

    const error: unknown = await inviteMember({ organizationId: "org-1", email: "a@b.com", role: "triager" }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("UNKNOWN");
    expect((error as Error).message).not.toContain("constraint");
  });

  it("surfaces the last-owner invariant with its dedicated code", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("LAST_OWNER: An organization must always have at least one active owner.");
    });
    const { removeMember, OrganizationServiceError } = await import("../../services/organization-members");

    const error: unknown = await removeMember({ organizationId: "org-1", targetUserId: "user-1" }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect(error).toMatchObject({ code: "LAST_OWNER", message: "An organization must always have at least one active owner." });
  });
});

describe("organization-members service: every documented SQL error code maps correctly", () => {
  // Every CODE the migration's `raise exception 'CODE: message'` statements can produce
  // (see supabase/migrations/202608260001_..., grep for `using errcode`), proven against
  // the specific service call that can trigger it. This does not prove the database
  // actually raises these -- only that our TS layer, given each one, behaves correctly.
  const cases: { name: string; message: string; expectedCode: string; call: (services: typeof import("../../services/organization-members")) => Promise<unknown> }[] = [
    { name: "invitation not found", message: "INVITATION_NOT_FOUND: invitation not found", expectedCode: "INVITATION_NOT_FOUND", call: (s) => s.acceptInvitation("some-token") },
    { name: "invitation revoked", message: "INVITATION_REVOKED: invitation was revoked", expectedCode: "INVITATION_REVOKED", call: (s) => s.acceptInvitation("some-token") },
    { name: "invitation already accepted", message: "INVITATION_ALREADY_ACCEPTED: invitation already accepted", expectedCode: "INVITATION_ALREADY_ACCEPTED", call: (s) => s.acceptInvitation("some-token") },
    { name: "invitation expired", message: "INVITATION_EXPIRED: invitation has expired", expectedCode: "INVITATION_EXPIRED", call: (s) => s.acceptInvitation("some-token") },
    { name: "invitation email mismatch", message: "INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address", expectedCode: "INVITATION_EMAIL_MISMATCH", call: (s) => s.acceptInvitation("some-token") },
    { name: "invitation email mismatch (accept by id)", message: "INVITATION_EMAIL_MISMATCH: this invitation was sent to a different email address", expectedCode: "INVITATION_EMAIL_MISMATCH", call: (s) => s.acceptInvitationById("invite-1") },
    { name: "member not found (role change)", message: "MEMBER_NOT_FOUND: active membership not found", expectedCode: "MEMBER_NOT_FOUND", call: (s) => s.changeMemberRole({ organizationId: "org-1", targetUserId: "user-9", newRole: "triager" }) },
    { name: "member not suspended (reactivate)", message: "MEMBER_NOT_SUSPENDED: member is not currently suspended", expectedCode: "MEMBER_NOT_SUSPENDED", call: (s) => s.reactivateMember({ organizationId: "org-1", targetUserId: "user-9" }) },
    { name: "auth required (suspend)", message: "AUTH_REQUIRED: authentication required", expectedCode: "AUTH_REQUIRED", call: (s) => s.suspendMember({ organizationId: "org-1", targetUserId: "user-9" }) },
  ];

  for (const { name, message, expectedCode, call } of cases) {
    it(`${name} -> ${expectedCode}`, async () => {
      fakeClient.query.mockImplementation(async () => {
        throw new Error(message);
      });
      const services = await import("../../services/organization-members");

      const error: unknown = await call(services).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(services.OrganizationServiceError);
      expect((error as InstanceType<typeof services.OrganizationServiceError>).code).toBe(expectedCode);
    });
  }
});

describe("organization-members service: cross-organization access", () => {
  it("a member of organization A attempting organization B's mutation surfaces FORBIDDEN, and B's id reaches the RPC unmodified", async () => {
    // Simulates what the database does when auth.uid() has no active membership in the
    // target org: it returns FORBIDDEN regardless of what org id the client sent. This
    // proves the service layer passes the caller-specified org id straight through
    // (never substitutes or drops it) and correctly surfaces the resulting denial rather
    // than masking or misreporting it.
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("suspend_member")) {
        capturedArgs = params;
        throw new Error("FORBIDDEN: actor cannot suspend members in this organization");
      }
      return queryReturning([]);
    });
    const { suspendMember, OrganizationServiceError } = await import("../../services/organization-members");

    const error: unknown = await suspendMember({ organizationId: "org-B", targetUserId: "user-1" }).catch((thrown) => thrown);

    expect(capturedArgs?.[0]).toBe("org-B");
    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("FORBIDDEN");
  });

  // getOrganizationAuditActivity (Hactivity's data source, Turn 6/phase-9-ia) is a plain
  // SELECT against audit_logs, not a SECURITY DEFINER RPC -- so unlike suspendMember above,
  // the database's real denial mechanism is RLS row-filtering (private.has_org_role scopes
  // by BOTH organization_id and owner/security_admin role), not a thrown FORBIDDEN. A
  // caller without access gets back zero rows, silently -- this proves the service layer
  // passes the caller-specified organization id straight through to the query (never
  // substitutes or drops it) and returns exactly what the (mocked) RLS-scoped row set
  // contains, with no separate application-level filtering that could diverge from it.
  it("passes the caller-specified organization id straight through to the RLS-scoped query, and returns an empty page when RLS denies (cross-org/non-admin)", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      capturedArgs = params;
      return queryReturning([]); // what RLS returns for a caller with no owner/security_admin membership in this org
    });
    const { getOrganizationAuditActivity } = await import("../../services/organization-members");

    const page = await getOrganizationAuditActivity("org-B");

    expect(capturedArgs?.[0]).toBe("org-B");
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("returns the organization's own real audit rows when RLS admits the caller", async () => {
    fakeClient.query.mockImplementation(async () =>
      queryReturning([
        { id: "event-1", actor_id: "user-1", action: "report.accepted", entity_type: "report", entity_id: "report-1", metadata: {}, created_at: "2026-09-01T00:00:00Z" },
      ]),
    );
    const { getOrganizationAuditActivity } = await import("../../services/organization-members");

    const page = await getOrganizationAuditActivity("org-A");

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: "event-1", action: "report.accepted", entityType: "report" });
  });
});

describe("organization-members service: RPC call shape", () => {
  it("invites with a hashed token, never the raw one, and returns the raw token to the caller once", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("invite_organization_member")) {
        capturedArgs = params;
        return queryReturning([
          { id: "invite-1", organization_id: "org-1", email: "a@b.com", role: "triager", invited_by: "actor-1", message: null, expires_at: "2026-09-02T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { inviteMember } = await import("../../services/organization-members");
    const { hashInvitationToken } = await import("../../services/invitations");

    const { token, invitation } = await inviteMember({ organizationId: "org-1", email: "A@B.com", role: "triager" });

    expect(capturedArgs?.[0]).toBe("org-1");
    expect(capturedArgs?.[1]).toBe("A@B.com");
    expect(capturedArgs?.[2]).toBe("triager");
    expect(capturedArgs?.[4]).toBe(hashInvitationToken(token));
    expect(capturedArgs?.[4]).not.toBe(token);
    expect(invitation.id).toBe("invite-1");
  });

  it("passes the target org and user id, never a client-supplied actor id, to change_member_role", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("change_member_role")) {
        capturedArgs = params;
        return queryReturning([
          { organization_id: "org-1", user_id: "user-2", role: "security_admin", status: "active", invited_by: null, joined_at: "2026-08-01T00:00:00Z", suspended_at: null, removed_at: null, updated_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { changeMemberRole } = await import("../../services/organization-members");

    const result = await changeMemberRole({ organizationId: "org-1", targetUserId: "user-2", newRole: "security_admin" });

    expect(capturedArgs).toEqual(["org-1", "user-2", "security_admin"]);
    expect(result.role).toBe("security_admin");
  });

  it("accepts by invitation id with no token at all -- authorization is the email-match check inside the RPC, not a client secret", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("accept_organization_invitation_by_id")) {
        capturedArgs = params;
        return queryReturning([
          { organization_id: "org-1", user_id: "user-3", role: "triager", status: "active", invited_by: "owner-1", joined_at: "2026-08-26T00:00:00Z", suspended_at: null, removed_at: null, updated_at: "2026-08-26T00:00:00Z" },
        ]);
      }
      return queryReturning([]);
    });
    const { acceptInvitationById } = await import("../../services/organization-members");

    const result = await acceptInvitationById("invite-1");

    expect(capturedArgs).toEqual(["invite-1"]);
    expect(result.status).toBe("active");
  });
});

describe("organization-members service: reads", () => {
  it("maps a joined member row (profile embed) into the flat OrganizationMemberRecord shape", async () => {
    const row = {
      organization_id: "org-1",
      user_id: "user-1",
      role: "owner",
      status: "active",
      invited_by: null,
      joined_at: "2026-08-01T00:00:00Z",
      suspended_at: null,
      removed_at: null,
      updated_at: "2026-08-01T00:00:00Z",
      username: "alice",
      display_name: "Alice",
      email: "alice@example.com",
    };
    let capturedSql = "";
    fakeClient.query.mockImplementation(async (sql: string) => {
      capturedSql = sql;
      return queryReturning([row]);
    });
    const { listOrganizationMembers } = await import("../../services/organization-members");

    const [member] = await listOrganizationMembers("org-1");
    expect(capturedSql).toContain("m.organization_id = $1");
    expect(member).toMatchObject({ userId: "user-1", displayName: "Alice", email: "alice@example.com", role: "owner" });
  });

  it("returns null from getActorMembership when no membership row exists for the given userId", async () => {
    fakeClient.query.mockImplementation(async () => queryReturning([]));
    const { getActorMembership } = await import("../../services/organization-members");

    expect(await getActorMembership("user-1", "org-1")).toBeNull();
  });
});
