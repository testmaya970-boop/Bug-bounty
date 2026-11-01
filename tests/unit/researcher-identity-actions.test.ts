import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reviewKycFieldAction,
  submitMyKycAction,
  updateMyPayoutDetailsAction,
  updateMyPersonalDetailsAction,
  updateMyProfessionalDetailsAction,
} from "../../actions/researcher-profiles";
import * as researcherProfilesService from "../../services/researcher-profiles";

vi.mock("../../services/researcher-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/researcher-profiles")>();
  return {
    ...actual,
    updateMyProfessionalDetails: vi.fn(),
    updateMyPersonalDetails: vi.fn(),
    submitMyKyc: vi.fn(),
    updateMyPayoutDetails: vi.fn(),
    reviewKycField: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMyProfessionalDetailsAction: real fields, real recommendation input (see docs/decisions/0051)", () => {
  it("rejects an invalid focus area value rather than silently dropping it", async () => {
    const result = await updateMyProfessionalDetailsAction({ hackingInterests: ["not_a_real_focus_area"] as never });
    expect(result.ok).toBe(false);
    expect(researcherProfilesService.updateMyProfessionalDetails).not.toHaveBeenCalled();
  });

  it("passes valid interests through to the service untouched", async () => {
    const result = await updateMyProfessionalDetailsAction({ hackingInterests: ["web_applications", "apis"] });
    expect(result.ok).toBe(true);
    expect(researcherProfilesService.updateMyProfessionalDetails).toHaveBeenCalledWith(expect.objectContaining({ hackingInterests: ["web_applications", "apis"] }));
  });
});

describe("updateMyPersonalDetailsAction: gender/age, self-only", () => {
  it("rejects an invalid gender value", async () => {
    const result = await updateMyPersonalDetailsAction({ gender: "not_a_real_gender" as never });
    expect(result.ok).toBe(false);
    expect(researcherProfilesService.updateMyPersonalDetails).not.toHaveBeenCalled();
  });

  it("accepts a real gender/age_group pair", async () => {
    const result = await updateMyPersonalDetailsAction({ gender: "female", ageGroup: "18_30" });
    expect(result.ok).toBe(true);
    expect(researcherProfilesService.updateMyPersonalDetails).toHaveBeenCalledWith({ gender: "female", ageGroup: "18_30" });
  });
});

describe("submitMyKycAction: manual review fallback (PAN, passport, phone); Aadhaar only via DigiLocker", () => {
  it("normalizes a PAN to upper case and sends it for review", async () => {
    const result = await submitMyKycAction({ panNumber: "abcde1234f" });
    expect(result.ok).toBe(true);
    expect(researcherProfilesService.submitMyKyc).toHaveBeenCalledWith(expect.objectContaining({ panNumber: "ABCDE1234F" }));
  });

  it("rejects a malformed PAN with a message, before any database call", async () => {
    const result = await submitMyKycAction({ panNumber: "12345" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(researcherProfilesService.submitMyKyc).not.toHaveBeenCalled();
  });

  it("never forwards an Aadhaar number, even if a caller sends one (the database refuses it too)", async () => {
    await submitMyKycAction({ panNumber: "ABCDE1234F", aadhaarNumber: "123456789012" } as never);
    expect(researcherProfilesService.submitMyKyc).toHaveBeenCalledWith(expect.not.objectContaining({ aadhaarNumber: expect.anything() }));
  });
});

describe("updateMyPayoutDetailsAction: bank/PayPal, encrypted server-side", () => {
  it("rejects a missing/invalid method", async () => {
    const result = await updateMyPayoutDetailsAction({ method: "crypto_wallet" as never });
    expect(result.ok).toBe(false);
    expect(researcherProfilesService.updateMyPayoutDetails).not.toHaveBeenCalled();
  });

  it("accepts a real bank_transfer submission", async () => {
    const result = await updateMyPayoutDetailsAction({ method: "bank_transfer", bankAccountHolderName: "Riley Researcher", bankAccountNumber: "123456789", bankIfscOrRouting: "ABCD0123456" });
    expect(result.ok).toBe(true);
    expect(researcherProfilesService.updateMyPayoutDetails).toHaveBeenCalled();
  });
});

describe("reviewKycFieldAction: platform-admin-only -- the RPC itself is the real authorization boundary, this is just input validation", () => {
  it("rejects an invalid field name", async () => {
    const result = await reviewKycFieldAction({ targetUserId: "11111111-1111-4111-8111-111111111111", field: "ssn" as never, decision: "verified" });
    expect(result.ok).toBe(false);
    expect(researcherProfilesService.reviewKycField).not.toHaveBeenCalled();
  });

  it("passes a valid review decision through", async () => {
    const result = await reviewKycFieldAction({ targetUserId: "11111111-1111-4111-8111-111111111111", field: "pan", decision: "verified" });
    expect(result.ok).toBe(true);
    expect(researcherProfilesService.reviewKycField).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "pan", "verified", undefined);
  });
});
