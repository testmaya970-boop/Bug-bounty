import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { AuthServiceError, requestPasswordReset, resendConfirmationEmail, confirmPasswordReset, verifySignupCode, establishSessionForUser } from "@/services/auth";

// actions/auth.ts is a thin zod-validate + call-the-service + map-errors layer -- tested
// here against a mocked services/auth.ts (its one real collaborator for these actions),
// not against the database two layers down. This directly replaces the previous version
// of this file, which mocked @/lib/supabase/server -- the service itself no longer talks
// to Supabase at all (see services/auth.ts).
vi.mock("@/services/auth", async () => {
  const actual = await vi.importActual<typeof import("@/services/auth")>("@/services/auth");
  return {
    ...actual,
    requestPasswordReset: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    confirmPasswordReset: vi.fn(),
    verifySignupCode: vi.fn(),
    establishSessionForUser: vi.fn(),
  };
});
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db/pool", () => ({ withActorTransaction: vi.fn(), callRpc: vi.fn() }));
// determineDefaultDestination's own branching logic (org-only/researcher-only/both/
// neither) is already covered by tests/unit/auth-signin-signup-routing.test.ts -- mocked
// wholesale here since this file is testing verifySignupCodeAction's own orchestration
// (call the service, establish a session, redirect), not re-deriving that routing logic.
vi.mock("@/lib/auth/default-destination", () => ({ determineDefaultDestination: vi.fn().mockResolvedValue("/") }));

const mockedRequestPasswordReset = vi.mocked(requestPasswordReset);
const mockedResendConfirmationEmail = vi.mocked(resendConfirmationEmail);
const mockedConfirmPasswordReset = vi.mocked(confirmPasswordReset);
const mockedVerifySignupCode = vi.mocked(verifySignupCode);
const mockedEstablishSessionForUser = vi.mocked(establishSessionForUser);
const mockedRedirect = vi.mocked(redirect);

beforeEach(() => {
  mockedRequestPasswordReset.mockReset();
  mockedResendConfirmationEmail.mockReset();
  mockedConfirmPasswordReset.mockReset();
  mockedVerifySignupCode.mockReset();
  mockedEstablishSessionForUser.mockReset().mockResolvedValue(undefined);
  mockedRedirect.mockReset();
});

describe("requestPasswordResetAction: never a distinguishable response between a real and a nonexistent account", () => {
  it("rejects a malformed email as INVALID_INPUT without ever calling the service", async () => {
    const { requestPasswordResetAction } = await import("../../actions/auth");

    const result = await requestPasswordResetAction({ email: "not-an-email" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Enter a valid email address." });
    expect(mockedRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("returns { ok: true } for a well-formed email regardless of whether the service resolves normally", async () => {
    mockedRequestPasswordReset.mockResolvedValue(undefined);
    const { requestPasswordResetAction } = await import("../../actions/auth");

    const result = await requestPasswordResetAction({ email: "researcher@example.test" });

    expect(result).toEqual({ ok: true });
  });

  it("swallows an unrecognized service error into the identical success response -- surfacing it would itself be a distinguishable signal", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new AuthServiceError("The request could not be completed. Try again in a moment.", "UNKNOWN"));
    const { requestPasswordResetAction } = await import("../../actions/auth");

    const result = await requestPasswordResetAction({ email: "researcher@example.test" });

    expect(result).toEqual({ ok: true });
  });

  it("still surfaces a genuine rate limit -- a real, non-enumerating signal", async () => {
    mockedRequestPasswordReset.mockRejectedValue(new AuthServiceError("Too many attempts. Wait a moment and try again.", "RATE_LIMITED"));
    const { requestPasswordResetAction } = await import("../../actions/auth");

    const result = await requestPasswordResetAction({ email: "researcher@example.test" });

    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe("RATE_LIMITED");
  });
});

describe("resendConfirmationEmailAction: enumeration-safe, same neutral contract as requestPasswordResetAction", () => {
  it("rejects a malformed email as INVALID_INPUT without ever calling the service", async () => {
    const { resendConfirmationEmailAction } = await import("../../actions/auth");

    const result = await resendConfirmationEmailAction({ email: "not-an-email" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Enter a valid email address." });
    expect(mockedResendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("calls the service with the given email", async () => {
    mockedResendConfirmationEmail.mockResolvedValue(undefined);
    const { resendConfirmationEmailAction } = await import("../../actions/auth");

    await resendConfirmationEmailAction({ email: "researcher@example.test" });

    expect(mockedResendConfirmationEmail).toHaveBeenCalledWith("researcher@example.test");
  });

  it("returns { ok: true } identically whether the account exists, doesn't exist, or is already confirmed -- the service itself is the enumeration-safe boundary", async () => {
    mockedResendConfirmationEmail.mockResolvedValue(undefined);
    const { resendConfirmationEmailAction } = await import("../../actions/auth");

    const result = await resendConfirmationEmailAction({ email: "anyone@example.test" });

    expect(result).toEqual({ ok: true });
  });

  it("still surfaces a genuine rate limit -- a real, non-enumerating signal", async () => {
    mockedResendConfirmationEmail.mockRejectedValue(new AuthServiceError("Too many attempts. Wait a moment and try again.", "RATE_LIMITED"));
    const { resendConfirmationEmailAction } = await import("../../actions/auth");

    const result = await resendConfirmationEmailAction({ email: "researcher@example.test" });

    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe("RATE_LIMITED");
  });
});

describe("verifySignupCodeAction: the signup-time code-verification step", () => {
  it("rejects a non-6-digit code as INVALID_INPUT without calling the service", async () => {
    const { verifySignupCodeAction } = await import("../../actions/auth");

    const result = await verifySignupCodeAction({ email: "researcher@example.test", code: "12ab" });

    expect(result.ok).toBe(false);
    expect(mockedVerifySignupCode).not.toHaveBeenCalled();
  });

  it("on a correct code, establishes a session and redirects to the account's default destination", async () => {
    mockedVerifySignupCode.mockResolvedValue({ userId: "user-1" });
    const { verifySignupCodeAction } = await import("../../actions/auth");

    await verifySignupCodeAction({ email: "researcher@example.test", code: "123456" });

    expect(mockedVerifySignupCode).toHaveBeenCalledWith("researcher@example.test", "123456");
    expect(mockedEstablishSessionForUser).toHaveBeenCalledWith("user-1");
    expect(mockedRedirect).toHaveBeenCalledWith("/");
  });

  it("does not redirect and returns the mapped error when the code is wrong/expired", async () => {
    mockedVerifySignupCode.mockRejectedValue(new AuthServiceError("That code didn't match or has expired. Request a new one and try again.", "INVALID_CODE"));
    const { verifySignupCodeAction } = await import("../../actions/auth");

    const result = await verifySignupCodeAction({ email: "researcher@example.test", code: "000000" });

    expect(result).toEqual({ ok: false, code: "INVALID_CODE", message: "That code didn't match or has expired. Request a new one and try again." });
    expect(mockedEstablishSessionForUser).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("honors a real, safe redirectTo over the derived default", async () => {
    mockedVerifySignupCode.mockResolvedValue({ userId: "user-1" });
    const { verifySignupCodeAction } = await import("../../actions/auth");

    await verifySignupCodeAction({ email: "researcher@example.test", code: "123456", redirectTo: "/programs" });

    expect(mockedRedirect).toHaveBeenCalledWith("/programs");
  });
});

describe("resetPasswordAction: requires the token from the emailed reset link", () => {
  it("rejects a missing token as INVALID_INPUT without calling the service", async () => {
    const { resetPasswordAction } = await import("../../actions/auth");

    const result = await resetPasswordAction({ token: "", password: "a-real-new-password" });

    expect(result.ok).toBe(false);
    expect(mockedConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than the real 12-character minimum (docs/decisions/0053) as INVALID_INPUT without calling the service", async () => {
    const { resetPasswordAction } = await import("../../actions/auth");

    const result = await resetPasswordAction({ token: "a-real-token", password: "short" });

    expect(result).toEqual({ ok: false, code: "INVALID_INPUT", message: "Use at least 12 characters -- longer is the single strongest thing a password can be." });
    expect(mockedConfirmPasswordReset).not.toHaveBeenCalled();
  });

  it("on success, calls the service with the token and new password", async () => {
    mockedConfirmPasswordReset.mockResolvedValue(undefined);
    const { resetPasswordAction } = await import("../../actions/auth");

    const result = await resetPasswordAction({ token: "a-real-token", password: "a-real-new-password" });

    expect(result).toEqual({ ok: true });
    expect(mockedConfirmPasswordReset).toHaveBeenCalledWith("a-real-token", "a-real-new-password");
  });

  it("on failure (e.g. an expired/already-used token), returns the mapped error", async () => {
    mockedConfirmPasswordReset.mockRejectedValue(new AuthServiceError("This link has expired or was already used. Request a new one.", "SESSION_EXPIRED"));
    const { resetPasswordAction } = await import("../../actions/auth");

    const result = await resetPasswordAction({ token: "a-real-token", password: "a-real-new-password" });

    expect(result).toEqual({ ok: false, code: "SESSION_EXPIRED", message: "This link has expired or was already used. Request a new one." });
  });
});
