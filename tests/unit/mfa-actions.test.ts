import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { confirmMfaEnrollmentAction, redeemBackupCodeGateAction, requestMfaVerificationCodeAction, revokeMySessionAction, verifyMfaGateAction } from "../../actions/mfa";
import * as mfaService from "../../services/mfa";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../services/mfa", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/mfa")>();
  return { ...actual, confirmMfaEnrollment: vi.fn(), verifyMfaCode: vi.fn(), redeemBackupCode: vi.fn(), revokeMySession: vi.fn(), requestMfaVerificationCode: vi.fn() };
});

const mockedRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmMfaEnrollmentAction: validates a real 6-digit code shape before ever calling the service", () => {
  it("rejects a non-6-digit code without calling the service", async () => {
    const result = await confirmMfaEnrollmentAction({ factorId: "11111111-1111-4111-8111-111111111111", code: "12ab" });
    expect(result.ok).toBe(false);
    expect(mfaService.confirmMfaEnrollment).not.toHaveBeenCalled();
  });

  it("passes a valid 6-digit code straight through", async () => {
    vi.mocked(mfaService.confirmMfaEnrollment).mockResolvedValue(undefined);
    const result = await confirmMfaEnrollmentAction({ factorId: "11111111-1111-4111-8111-111111111111", code: "123456" });
    expect(result.ok).toBe(true);
    expect(mfaService.confirmMfaEnrollment).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "123456");
  });
});

describe("requestMfaVerificationCodeAction: issues a fresh emailed code", () => {
  it("returns ok on success", async () => {
    vi.mocked(mfaService.requestMfaVerificationCode).mockResolvedValue(undefined);
    const result = await requestMfaVerificationCodeAction();
    expect(result.ok).toBe(true);
  });

  it("surfaces a typed error (e.g. rate limited) without throwing", async () => {
    vi.mocked(mfaService.requestMfaVerificationCode).mockRejectedValue(new mfaService.OrganizationServiceError("Too many codes", "RATE_LIMITED"));
    const result = await requestMfaVerificationCodeAction();
    expect(result.ok).toBe(false);
  });
});

describe("verifyMfaGateAction: the sign-in-time email-OTP check -- redirects only after a real verify() succeeds", () => {
  it("does not redirect when the code is wrong", async () => {
    vi.mocked(mfaService.verifyMfaCode).mockRejectedValue(new mfaService.OrganizationServiceError("bad code", "INVALID_CODE"));
    const result = await verifyMfaGateAction({ factorId: "11111111-1111-4111-8111-111111111111", code: "000000" });
    expect(result.ok).toBe(false);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("redirects to the preserved destination once verification succeeds", async () => {
    vi.mocked(mfaService.verifyMfaCode).mockResolvedValue(undefined);
    await verifyMfaGateAction({ factorId: "11111111-1111-4111-8111-111111111111", code: "123456", redirectTo: "/programs" });
    expect(mockedRedirect).toHaveBeenCalledWith("/programs");
  });

  it("falls back to a safe default, never an open redirect, for an unsafe redirectTo", async () => {
    vi.mocked(mfaService.verifyMfaCode).mockResolvedValue(undefined);
    await verifyMfaGateAction({ factorId: "11111111-1111-4111-8111-111111111111", code: "123456", redirectTo: "//evil.test" });
    expect(mockedRedirect).toHaveBeenCalledWith("/");
  });
});

describe("redeemBackupCodeGateAction: the backup-code equivalent path", () => {
  it("redirects once redemption succeeds", async () => {
    vi.mocked(mfaService.redeemBackupCode).mockResolvedValue(undefined);
    await redeemBackupCodeGateAction({ code: "ABCD1234EF", redirectTo: "/programs" });
    expect(mockedRedirect).toHaveBeenCalledWith("/programs");
  });

  it("does not redirect when the code is invalid or already used", async () => {
    vi.mocked(mfaService.redeemBackupCode).mockRejectedValue(new mfaService.OrganizationServiceError("invalid", "INVALID_CODE"));
    const result = await redeemBackupCodeGateAction({ code: "ALREADYUSED" });
    expect(result.ok).toBe(false);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});

describe("revokeMySessionAction: validates a real session id before calling the service", () => {
  it("rejects a non-uuid session id", async () => {
    const result = await revokeMySessionAction({ sessionId: "not-a-uuid" });
    expect(result.ok).toBe(false);
    expect(mfaService.revokeMySession).not.toHaveBeenCalled();
  });

  it("passes a valid session id through", async () => {
    vi.mocked(mfaService.revokeMySession).mockResolvedValue(undefined);
    const result = await revokeMySessionAction({ sessionId: "11111111-1111-4111-8111-111111111111" });
    expect(result.ok).toBe(true);
    expect(mfaService.revokeMySession).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });
});
