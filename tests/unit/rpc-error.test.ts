import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/error-tracking", () => ({ recordError: vi.fn() }));

describe("database messages read as sentences", () => {
  it("capitalises, splits ' -- ' into sentences and ends with a stop", async () => {
    const { toSentence } = await import("../../services/rpc-error");
    expect(toSentence("add at least one in-scope asset before submitting for review")).toBe("Add at least one in-scope asset before submitting for review.");
    expect(toSentence("the researcher accepted this award -- only Unpatched can change it, through a dispute")).toBe(
      "The researcher accepted this award. Only Unpatched can change it, through a dispute.",
    );
    expect(toSentence("Already a sentence.")).toBe("Already a sentence.");
  });

  it("keeps the error code and maps the message", async () => {
    const { mapRpcError, OrganizationServiceError } = await import("../../services/rpc-error");
    let thrown: unknown;
    try {
      mapRpcError({ message: "INVITATION_PENDING: an invitation is already pending for this email" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrganizationServiceError);
    expect(thrown).toMatchObject({ code: "INVITATION_PENDING", message: "An invitation is already pending for this email." });
  });
});
