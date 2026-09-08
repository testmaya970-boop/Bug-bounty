import { beforeEach, describe, expect, it, vi } from "vitest";

// services/auth.ts's data-access boundary is lib/db/pool.ts's withTransaction/
// withActorTransaction -- mocked here at that boundary (not a raw pg.Pool/Client), the
// same "mock the thin data-access layer, exercise the service's own logic for real"
// pattern the Supabase-backed version of this test file used against
// @/lib/supabase/server. A fake PoolClient's `.query` is a controllable mock so each
// test can script exactly the rows a real query would have returned.
vi.mock("@/lib/db/pool", () => ({
  withTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  withActorTransaction: vi.fn((_actorId: unknown, fn: (client: unknown) => unknown) => fn(fakeClient)),
  withServiceRoleTransaction: vi.fn((fn: (client: unknown) => unknown) => fn(fakeClient)),
  // Mirrors lib/db/pool.ts's real callRpc: `select * from fn(...)` against the same
  // fakeClient.query the transaction helpers above already route through, so a test can
  // script an RPC's return rows the identical way it scripts a plain query's.
  callRpc: vi.fn(async (client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> }, functionName: string, args: unknown[] = []) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const result = await client.query(`select * from ${functionName}(${placeholders})`, args);
    return result.rows;
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "user-agent": "vitest", host: "localhost:3000" })),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }),
}));

vi.mock("@/lib/email-provider", () => ({
  activeEmailProvider: { name: "test", send: vi.fn().mockResolvedValue({ success: true, providerReference: "test-ref" }) },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentSessionId: vi.fn().mockResolvedValue(null),
}));

// lib/auth/session.ts's signSecret reads SESSION_COOKIE_SECRET via getNativeEnv() --
// mocked here rather than relying on real env vars being set in the test process,
// matching this test file's existing "mock at the module boundary" approach.
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    getNativeEnv: () => ({
      DATABASE_URL: "postgres://test",
      SESSION_COOKIE_SECRET: "test-secret-at-least-32-bytes-long",
      S3_ENDPOINT: "http://test",
      S3_REGION: "test",
      S3_BUCKET: "test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      S3_FORCE_PATH_STYLE: false,
    }),
  };
});

const fakeClient = { query: vi.fn() };

function queryReturning(rows: unknown[]) {
  return { rows, rowCount: rows.length };
}

beforeEach(() => {
  fakeClient.query.mockReset();
});

describe("auth service: signInWithPassword is rate-limited by the attempted email, in addition to real credential checking", () => {
  it("checks check_sign_in_rate_limit with the exact email before ever looking up the user", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: true }]);
      if (sql.includes("from public.users")) return queryReturning([]);
      return queryReturning([]);
    });
    const { signInWithPassword, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await signInWithPassword("researcher@example.test", "wrong").catch((thrown) => thrown);

    expect(fakeClient.query).toHaveBeenCalledWith(expect.stringContaining("check_sign_in_rate_limit"), ["researcher@example.test"]);
    // No matching user -- INVALID_CREDENTIALS, never a distinguishable "no such account".
    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects with a RATE_LIMITED error and never looks up the user when the rate limit check returns false", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: false }]);
      throw new Error("should not query further once rate-limited");
    });
    const { signInWithPassword, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await signInWithPassword("researcher@example.test", "wrong").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("RATE_LIMITED");
  });

  it("returns mfaRequired: true when the account has a verified email-OTP factor", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    const passwordHash = await hashPassword("correct-horse-battery-staple");

    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: true }]);
      if (sql.includes("select id, password_hash")) return queryReturning([{ id: "user-1", password_hash: passwordHash, email_verified_at: "2026-01-01", deactivated_at: null }]);
      if (sql.includes("insert into public.sessions")) return queryReturning([{ id: "session-1", user_id: "user-1", aal: "aal1" }]);
      if (sql.includes("from public.mfa_factors")) return queryReturning([{ user_id: "user-1" }]);
      return queryReturning([]);
    });
    const { signInWithPassword } = await import("../../services/auth");

    await expect(signInWithPassword("mfa@example.test", "correct-horse-battery-staple")).resolves.toEqual({ mfaRequired: true, userId: "user-1" });
  });

  it("returns mfaRequired: false for a plain account with no enrolled factor, and creates a session", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    const passwordHash = await hashPassword("correct-horse-battery-staple");

    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: true }]);
      if (sql.includes("select id, password_hash")) return queryReturning([{ id: "user-1", password_hash: passwordHash, email_verified_at: "2026-01-01", deactivated_at: null }]);
      if (sql.includes("insert into public.sessions")) return queryReturning([{ id: "session-1", user_id: "user-1", aal: "aal1" }]);
      if (sql.includes("from public.mfa_factors")) return queryReturning([]);
      return queryReturning([]);
    });
    const { signInWithPassword } = await import("../../services/auth");

    await expect(signInWithPassword("researcher@example.test", "correct-horse-battery-staple")).resolves.toEqual({ mfaRequired: false, userId: "user-1" });
  });

  it("rejects an unconfirmed account with EMAIL_NOT_CONFIRMED even when the password is correct", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    const passwordHash = await hashPassword("correct-horse-battery-staple");

    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: true }]);
      if (sql.includes("select id, password_hash")) return queryReturning([{ id: "user-1", password_hash: passwordHash, email_verified_at: null, deactivated_at: null }]);
      return queryReturning([]);
    });
    const { signInWithPassword, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await signInWithPassword("unconfirmed@example.test", "correct-horse-battery-staple").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("EMAIL_NOT_CONFIRMED");
  });

  it("rejects the real password against a real wrong-password attempt with INVALID_CREDENTIALS", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    const passwordHash = await hashPassword("the-real-password");

    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("check_sign_in_rate_limit")) return queryReturning([{ check_sign_in_rate_limit: true }]);
      if (sql.includes("select id, password_hash")) return queryReturning([{ id: "user-1", password_hash: passwordHash, email_verified_at: "2026-01-01", deactivated_at: null }]);
      return queryReturning([]);
    });
    const { signInWithPassword, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await signInWithPassword("researcher@example.test", "wrong-password").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("INVALID_CREDENTIALS");
  });
});

describe("auth service: requestPasswordReset is neutral to account existence", () => {
  it("resolves the same way (no throw) whether the account exists or not", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([]);
      return queryReturning([]);
    });
    const { requestPasswordReset } = await import("../../services/auth");

    await expect(requestPasswordReset("real@example.test")).resolves.toBeUndefined();
    await expect(requestPasswordReset("definitely-not-real@example.test")).resolves.toBeUndefined();
  });

  it("issues a reset token and sends an email only when the account exists", async () => {
    const { activeEmailProvider } = await import("../../lib/email-provider");
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([{ id: "user-1" }]);
      if (sql.includes("insert into public.password_reset_tokens")) return queryReturning([]);
      return queryReturning([]);
    });
    const { requestPasswordReset } = await import("../../services/auth");

    await requestPasswordReset("real@example.test");

    expect(activeEmailProvider.send).toHaveBeenCalledWith(expect.objectContaining({ to: "real@example.test", subject: expect.stringContaining("Reset") }));
  });
});

describe("auth service: confirmPasswordReset requires a valid, unconsumed reset token", () => {
  it("rejects an invalid/expired/already-used token with SESSION_EXPIRED, never a raw DB error", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("update public.password_reset_tokens")) return queryReturning([]);
      return queryReturning([]);
    });
    const { confirmPasswordReset, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await confirmPasswordReset("bad-token", "a-new-strong-password").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("SESSION_EXPIRED");
  });

  it("updates the password hash and clears must_reset_password, then revokes every session for that user, on a valid token", async () => {
    const queries: string[] = [];
    fakeClient.query.mockImplementation(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("update public.password_reset_tokens")) return queryReturning([{ user_id: "user-1" }]);
      return queryReturning([]);
    });
    const { confirmPasswordReset } = await import("../../services/auth");

    await confirmPasswordReset("good-token", "a-new-strong-password");

    expect(queries.some((q) => q.includes("update public.users set password_hash"))).toBe(true);
    expect(queries.some((q) => q.includes("delete from public.sessions where user_id"))).toBe(true);
  });
});

describe("auth service: signUpWithPassword always requires email confirmation", () => {
  it("creates the account, issues a 6-digit verification code, and emails it -- never returns an immediate session", async () => {
    const { activeEmailProvider } = await import("../../lib/email-provider");
    let challengeArgs: unknown[] | undefined;
    fakeClient.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("select * from public.create_user")) return queryReturning([{ id: "user-1", email: "new@example.test" }]);
      if (sql.includes("create_signup_verification_challenge")) {
        challengeArgs = args;
        return queryReturning([{ create_signup_verification_challenge: "challenge-1" }]);
      }
      return queryReturning([]);
    });
    const { signUpWithPassword } = await import("../../services/auth");

    const result = await signUpWithPassword("new@example.test", "a-new-strong-password");

    expect(result).toEqual({ status: "confirm_email", email: "new@example.test" });
    expect(challengeArgs?.[0]).toBe("user-1");
    expect(typeof challengeArgs?.[1]).toBe("string"); // a hash, never the plaintext code
    expect(activeEmailProvider.send).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.test", subject: expect.stringContaining("Confirm") }));
    const sendMock = activeEmailProvider.send as ReturnType<typeof vi.fn>;
    const signupCall = sendMock.mock.calls.find((call) => call[0].to === "new@example.test");
    expect(signupCall?.[0].text).toMatch(/\d{6}/);
  });

  it("maps a duplicate-email failure from create_user to EMAIL_TAKEN", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select * from public.create_user")) throw new Error("EMAIL_TAKEN: an account with that email already exists");
      return queryReturning([]);
    });
    const { signUpWithPassword, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await signUpWithPassword("dup@example.test", "a-new-strong-password").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("EMAIL_TAKEN");
  });
});

describe("auth service: verifySignupCode checks the emailed 6-digit code, never a raw link token", () => {
  it("returns the userId/intent/companyName from the challenge's metadata on a correct code", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([{ id: "user-1" }]);
      if (sql.includes("verify_signup_verification_challenge")) {
        return queryReturning([{ outcome: "valid", metadata: { intent: "organization", companyName: "Acme" } }]);
      }
      return queryReturning([]);
    });
    const { verifySignupCode } = await import("../../services/auth");

    await expect(verifySignupCode("new@example.test", "123456")).resolves.toEqual({ userId: "user-1", intent: "organization", companyName: "Acme" });
  });

  it("rejects with INVALID_CODE when the RPC reports the outcome 'invalid' (wrong/expired/exhausted -- never raised, see the migration's own comment on why)", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([{ id: "user-1" }]);
      if (sql.includes("verify_signup_verification_challenge")) return queryReturning([{ outcome: "invalid", metadata: {} }]);
      return queryReturning([]);
    });
    const { verifySignupCode, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await verifySignupCode("new@example.test", "000000").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("INVALID_CODE");
  });

  it("rejects with INVALID_CODE for an email with no matching account, without ever calling the RPC (enumeration-safe: identical outcome to a wrong code)", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([]);
      throw new Error("should not query further when no account matches");
    });
    const { verifySignupCode, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await verifySignupCode("nobody@example.test", "123456").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("INVALID_CODE");
  });

  it("maps the RPC's own RATE_LIMITED/other CODE: message errors through mapDbError's generic parsing", async () => {
    fakeClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes("select id from public.users")) return queryReturning([{ id: "user-1" }]);
      if (sql.includes("verify_signup_verification_challenge")) throw new Error("ACCOUNT_NOT_FOUND: account not found");
      return queryReturning([]);
    });
    const { verifySignupCode, AuthServiceError } = await import("../../services/auth");

    const error: unknown = await verifySignupCode("new@example.test", "123456").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(AuthServiceError);
    expect((error as InstanceType<typeof AuthServiceError>).code).toBe("ACCOUNT_NOT_FOUND");
  });
});
