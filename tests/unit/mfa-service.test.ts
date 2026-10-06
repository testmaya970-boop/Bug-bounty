import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeEmailProvider } from "../../lib/email-provider";

// services/mfa.ts's data-access boundary is lib/db/pool.ts's withActorTransaction/callRpc
// -- mocked here at that boundary, same "mock the thin data-access layer, exercise the
// service's own logic for real" pattern used across the native-Postgres migration's test
// suite. getCurrentUser/getCurrentSessionId (lib/auth/current-user.ts) and
// elevateSessionToAal2 (lib/auth/session.ts) are mocked directly since they depend on
// next/headers()/cookies(), unavailable outside a real request.
const fakeClient = { query: vi.fn() };

vi.mock("../../lib/db/pool", async () => {
  const actual = await vi.importActual<typeof import("../../lib/db/pool")>("../../lib/db/pool");
  return {
    ...actual,
    withActorTransaction: vi.fn((_actorId: string, fn: (client: unknown) => unknown) => fn(fakeClient)),
    // elevateSessionToAal2 runs under service_role (public.sessions has no grant for
    // authenticated) -- see services/mfa.ts's own comment for why.
    withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  };
});
vi.mock("../../lib/auth/current-user", () => ({ getCurrentUser: vi.fn(), getCurrentSessionId: vi.fn() }));
vi.mock("../../lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/auth/session")>();
  return { ...actual, elevateSessionToAal2: vi.fn() };
});
vi.mock("../../lib/email-provider", () => ({ activeEmailProvider: { name: "test", send: vi.fn() } }));

const mockedSend = vi.mocked(activeEmailProvider.send);

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

const USER = { id: "user-1", email: "researcher@example.test" };

async function mockedCurrentUser() {
  const { getCurrentUser } = await import("../../lib/auth/current-user");
  return vi.mocked(getCurrentUser);
}
async function mockedSessionId() {
  const { getCurrentSessionId } = await import("../../lib/auth/current-user");
  return vi.mocked(getCurrentSessionId);
}
async function mockedElevate() {
  const { elevateSessionToAal2 } = await import("../../lib/auth/session");
  return vi.mocked(elevateSessionToAal2);
}

beforeEach(async () => {
  fakeClient.query.mockReset();
  mockedSend.mockReset();
  mockedSend.mockResolvedValue({ success: true, providerReference: "dev-1" });
  (await mockedCurrentUser()).mockReset().mockResolvedValue(USER as never);
  (await mockedSessionId()).mockReset().mockResolvedValue("session-1");
  (await mockedElevate()).mockReset().mockResolvedValue(undefined);
});

describe("listMyMfaFactors: maps public.list_my_mfa_factors() rows -- never invented", () => {
  it("maps a verified factor, keyed by the account's own user id", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("list_my_mfa_factors")) return queryReturning([{ id: "user-1", status: "verified", created_at: "2026-01-01T00:00:00Z" }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { listMyMfaFactors } = await import("../../services/mfa");

    await expect(listMyMfaFactors()).resolves.toEqual([{ id: "user-1", status: "verified", createdAt: "2026-01-01T00:00:00Z" }]);
  });
});

describe("beginMfaEnrollment: generates a real 6-digit code, persists only its hash, emails the plaintext code", () => {
  it("calls create_mfa_challenge with purpose 'enroll' and a hash, then sends an email to the account's own address", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("create_mfa_challenge")) {
        capturedArgs = params;
        return queryReturning([{ create_mfa_challenge: "challenge-1" }]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { beginMfaEnrollment } = await import("../../services/mfa");

    const result = await beginMfaEnrollment();

    expect(result).toEqual({ factorId: "user-1" });
    expect(capturedArgs?.[0]).toBe("enroll");
    expect(typeof capturedArgs?.[1]).toBe("string");
    expect(capturedArgs?.[1]).not.toMatch(/^\d{6}$/); // a hash, never the plaintext code
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ to: "researcher@example.test" }));
    const sentText = mockedSend.mock.calls[0][0].text;
    expect(sentText).toMatch(/\d{6}/);
  });

  it("throws a typed error when the account has no email on file, without ever calling the RPC", async () => {
    (await mockedCurrentUser()).mockResolvedValue({ id: "user-1", email: null } as never);
    const { beginMfaEnrollment, OrganizationServiceError } = await import("../../services/mfa");

    const error: unknown = await beginMfaEnrollment().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect(fakeClient.query).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("maps the RPC's own ALREADY_ENROLLED error (re-enrolling a verified account)", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("ALREADY_ENROLLED: two-factor authentication is already enabled");
    });
    const { beginMfaEnrollment, OrganizationServiceError } = await import("../../services/mfa");

    const error: unknown = await beginMfaEnrollment().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("ALREADY_ENROLLED");
  });
});

describe("confirmMfaEnrollment / verifyMfaCode: a real server-side challenge check, never a client-side code check", () => {
  // verify_mfa_challenge(code_hash) looks up the actor's own latest unconsumed challenge
  // internally (auth.uid()-scoped, SECURITY DEFINER) -- services/mfa.ts no longer
  // pre-queries public.mfa_challenges itself at all. An earlier version did exactly that
  // under the authenticated role, which was never granted table access (only service_role
  // was), so every verification attempt failed with "permission denied for table
  // mfa_challenges" until db/migrations/202610010002_fix_mfa_verify_challenge_lookup.sql
  // removed that call site. These tests exercise the fixed, single-RPC-call shape.
  it("calls verify_mfa_challenge with only the code's hash", async () => {
    let verifyArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("verify_mfa_challenge")) {
        verifyArgs = params;
        return queryReturning([{ verify_mfa_challenge: "enroll" }]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { confirmMfaEnrollment } = await import("../../services/mfa");

    await confirmMfaEnrollment("user-1", "123456");

    expect(verifyArgs).toHaveLength(1);
    expect(typeof verifyArgs?.[0]).toBe("string");
  });

  it("maps the RPC's own INVALID_CODE error (no owned/unconsumed challenge exists at all) to a real, user-facing error -- never a raw provider string", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("verify_mfa_challenge")) throw new Error("INVALID_CODE: that code is invalid or has expired");
      throw new Error(`unexpected query: ${sql}`);
    });
    const { confirmMfaEnrollment, OrganizationServiceError } = await import("../../services/mfa");

    const error: unknown = await confirmMfaEnrollment("user-1", "000000").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_CODE");
  });

  it("maps the RPC's own returned 'invalid' outcome (a wrong/expired/exhausted code, which verify_mfa_challenge never raises for -- see its own migration comment on why) to the identical INVALID_CODE error", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("verify_mfa_challenge")) return queryReturning([{ verify_mfa_challenge: "invalid" }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { confirmMfaEnrollment, OrganizationServiceError } = await import("../../services/mfa");

    const error: unknown = await confirmMfaEnrollment("user-1", "000000").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("INVALID_CODE");
  });

  it("elevates the current session to aal2 on a successful sign-in-time ('verify' purpose) check", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("verify_mfa_challenge")) return queryReturning([{ verify_mfa_challenge: "verify" }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { verifyMfaCode } = await import("../../services/mfa");

    await verifyMfaCode("user-1", "123456");

    expect(await mockedElevate()).toHaveBeenCalledWith(fakeClient, "session-1");
  });

  it("also elevates the session for an 'enroll' purpose success -- MfaSettings immediately calls generate_my_mfa_backup_codes right after, which itself requires a real aal2 session (202609020001); an earlier version skipped elevation here, which made every enrollment's own backup-code step fail with STRONG_AUTH_REQUIRED (confirmed live)", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("verify_mfa_challenge")) return queryReturning([{ verify_mfa_challenge: "enroll" }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { confirmMfaEnrollment } = await import("../../services/mfa");

    await confirmMfaEnrollment("user-1", "123456");

    expect(await mockedElevate()).toHaveBeenCalledWith(fakeClient, "session-1");
  });
});

describe("requestMfaVerificationCode: issues a fresh 'verify' challenge and emails it", () => {
  it("calls create_mfa_challenge with purpose 'verify' and sends the email", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("create_mfa_challenge")) {
        capturedArgs = params;
        return queryReturning([{ create_mfa_challenge: "challenge-2" }]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { requestMfaVerificationCode } = await import("../../services/mfa");

    await requestMfaVerificationCode();

    expect(capturedArgs?.[0]).toBe("verify");
    expect(mockedSend).toHaveBeenCalledWith(expect.objectContaining({ to: "researcher@example.test" }));
  });
});

describe("unenrollMfaFactor: a real unenroll RPC call", () => {
  it("calls unenroll_my_mfa_factor", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("unenroll_my_mfa_factor")) return queryReturning([]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { unenrollMfaFactor } = await import("../../services/mfa");

    await expect(unenrollMfaFactor()).resolves.toBeUndefined();
  });
});

describe("getMyMfaStatus: maps get_my_mfa_status()'s row, the one source of truth the MFA gate reads", () => {
  it("maps every field, including a false session_verified when the account isn't AAL2 and hasn't redeemed a backup code this session", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("get_my_mfa_status")) return queryReturning([{ totp_enrolled: true, current_aal: "aal1", session_verified: false, remaining_backup_codes: 7 }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { getMyMfaStatus } = await import("../../services/mfa");

    await expect(getMyMfaStatus()).resolves.toEqual({ totpEnrolled: true, currentAal: "aal1", sessionVerified: false, remainingBackupCodes: 7 });
  });
});

describe("generateMyBackupCodes / redeemBackupCode: server-generated, hashed at rest, returned in plaintext exactly once", () => {
  it("returns the plaintext codes array from the RPC response", async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}ABCD`);
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("generate_my_mfa_backup_codes")) return queryReturning([{ generate_my_mfa_backup_codes: codes }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { generateMyBackupCodes } = await import("../../services/mfa");

    await expect(generateMyBackupCodes()).resolves.toEqual(codes);
  });

  it("surfaces the RPC's own STRONG_AUTH_REQUIRED error when backup codes are requested without a real AAL2 session", async () => {
    fakeClient.query.mockImplementation(async () => {
      throw new Error("STRONG_AUTH_REQUIRED: verify your one-time code before generating backup codes");
    });
    const { generateMyBackupCodes, OrganizationServiceError } = await import("../../services/mfa");

    const error: unknown = await generateMyBackupCodes().catch((thrown) => thrown);

    expect(error).toBeInstanceOf(OrganizationServiceError);
    expect((error as InstanceType<typeof OrganizationServiceError>).code).toBe("STRONG_AUTH_REQUIRED");
  });

  it("redeemBackupCode passes the code and current session id straight through to redeem_mfa_backup_code", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("redeem_mfa_backup_code")) {
        capturedArgs = params;
        return queryReturning([]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { redeemBackupCode } = await import("../../services/mfa");

    await redeemBackupCode("ABCD1234EF");

    expect(capturedArgs).toEqual(["ABCD1234EF", "session-1"]);
  });
});

describe("listMySessions / revokeMySession / revokeAllOtherSessions: real public.sessions rows, never an invented device concept", () => {
  it("maps every session row including which one is the current device", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("list_my_sessions")) {
        return queryReturning([
          { id: "s1", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", user_agent: "Chrome on macOS", ip: "203.0.113.4", aal: "aal1", is_current: true },
          { id: "s2", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", user_agent: "Safari on iOS", ip: "198.51.100.2", aal: "aal1", is_current: false },
        ]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { listMySessions } = await import("../../services/mfa");

    const sessions = await listMySessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].isCurrent).toBe(true);
    expect(sessions[1].isCurrent).toBe(false);
  });

  it("revokeMySession calls revoke_my_session with exactly the target session id", async () => {
    let capturedArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("revoke_my_session")) {
        capturedArgs = params;
        return queryReturning([]);
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { revokeMySession } = await import("../../services/mfa");

    await revokeMySession("s2");

    expect(capturedArgs).toEqual(["s2"]);
  });

  it("revokeAllOtherSessions returns the real count of sessions revoked", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("revoke_all_other_sessions")) return queryReturning([{ revoke_all_other_sessions: 3 }]);
      throw new Error(`unexpected query: ${sql}`);
    });
    const { revokeAllOtherSessions } = await import("../../services/mfa");

    await expect(revokeAllOtherSessions()).resolves.toBe(3);
  });
});
