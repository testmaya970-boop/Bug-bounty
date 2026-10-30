import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked at the module boundary (services + email provider), matching this codebase's own
// existing action-layer testing convention (e.g. tests/unit/reports-service.test.ts mocks
// createSupabaseServerClient, not the RPC transport underneath it).
vi.mock("@/services/program-researchers", async () => {
  const actual = await vi.importActual<typeof import("../../services/program-researchers")>("@/services/program-researchers");
  return { ...actual, inviteResearcherByUsername: vi.fn() };
});
vi.mock("@/lib/email-provider", () => ({ activeEmailProvider: { name: "test", send: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The email names the program and organization (21 Oct); those reads are mocked here.
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner-1" })) }));
vi.mock("@/services/programs", () => ({ getProgram: vi.fn(async () => ({ name: "Acme Web" })) }));
vi.mock("@/services/organizations", () => ({ listCurrentUserOrganizations: vi.fn(async () => [{ id: "c3b1a9e4-4b7a-4c92-9b1a-6f2f1a1e2b31", name: "Acme" }]) }));
// Links are built from the pinned public origin (APP_ORIGIN), never request headers or a fallback.
vi.mock("@/lib/env", () => ({ getNativeEnv: () => ({ APP_ORIGIN: process.env.APP_ORIGIN ?? "https://app.example.test" }) }));

import { inviteResearcherByUsernameToProgram } from "../../actions/program-researchers";
import { inviteResearcherByUsername } from "../../services/program-researchers";
import { activeEmailProvider } from "../../lib/email-provider";

const mockedInvite = vi.mocked(inviteResearcherByUsername);
const mockedSend = vi.mocked(activeEmailProvider.send);

const VALID_INPUT = { organizationId: "c3b1a9e4-4b7a-4c92-9b1a-6f2f1a1e2b31", programId: "d4c2b0f5-5c8b-4d93-8c2b-7f3f2b2f3c42", username: "@jordan_ellis" };
// The database looks the email up from the @username; only the server ever holds it.
const RECIPIENT = "researcher@example.test";

const REAL_INVITATION = {
  invitation: {
    id: "invite-1",
    programId: VALID_INPUT.programId,
    organizationId: VALID_INPUT.organizationId,
    email: RECIPIENT,
    invitedUsername: "jordan_ellis",
    invitedBy: "owner-1",
    message: null,
    expiresAt: "2026-09-13T00:00:00Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2026-09-06T00:00:00Z",
  },
  recipientEmail: RECIPIENT,
  token: "raw-plaintext-token-value",
};

beforeEach(() => {
  mockedInvite.mockReset();
  mockedSend.mockReset();
  mockedSend.mockResolvedValue({ success: true, providerReference: "test-ref" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("inviteResearcherByUsernameToProgram action: a real invitation must actually reach the invitee, not just create a row", () => {
  it("sends a real email containing a working accept link built from the real, raw token -- never the hashed one", async () => {
    mockedInvite.mockResolvedValue(REAL_INVITATION);

    const result = await inviteResearcherByUsernameToProgram(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const [message] = mockedSend.mock.calls[0];
    expect(message.to).toBe(RECIPIENT);
    expect(message.text).toContain(`/program-invitations/${REAL_INVITATION.token}`);
    expect(message.text).not.toContain(REAL_INVITATION.invitation.id); // the token, not the row id, is the accept credential
    expect(message.idempotencyKey).toBe(REAL_INVITATION.invitation.id);
  });

  it("includes the organization's optional message when one was provided", async () => {
    mockedInvite.mockResolvedValue(REAL_INVITATION);

    await inviteResearcherByUsernameToProgram({ ...VALID_INPUT, message: "We'd love your help on our new API." });

    const [message] = mockedSend.mock.calls[0];
    expect(message.text).toContain("We'd love your help on our new API.");
  });

  it("never sends an email when the invitation itself failed (invalid input never reaches the service)", async () => {
    const result = await inviteResearcherByUsernameToProgram({ ...VALID_INPUT, username: "not a username!" });

    expect(result.ok).toBe(false);
    expect(mockedInvite).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("a failed email send never surfaces as an invitation failure -- the invitation already succeeded and is real regardless", async () => {
    mockedInvite.mockResolvedValue(REAL_INVITATION);
    mockedSend.mockRejectedValue(new Error("network error"));

    const result = await inviteResearcherByUsernameToProgram(VALID_INPUT);

    expect(result.ok).toBe(true);
  });

  it("builds the accept link from APP_ORIGIN (the pinned public origin)", async () => {
    mockedInvite.mockResolvedValue(REAL_INVITATION);
    vi.stubEnv("APP_ORIGIN", "https://unpatched.example");

    await inviteResearcherByUsernameToProgram(VALID_INPUT);

    const [message] = mockedSend.mock.calls[0];
    expect(message.text).toContain(`https://unpatched.example/program-invitations/${REAL_INVITATION.token}`);
  });
  it("tells the inviter when the provider rejected the email, and names the program and organization (21 Oct audit)", async () => {
    mockedInvite.mockResolvedValue(REAL_INVITATION);
    mockedSend.mockResolvedValue({ success: false, permanent: true, error: "rejected" });

    const result = await inviteResearcherByUsernameToProgram(VALID_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailSent).toBe(false);
    expect(result.data.inviteUrl).toContain(`/program-invitations/${REAL_INVITATION.token}`);
    expect(mockedSend.mock.calls[0][0].subject).toBe("Acme invited you to research Acme Web on Unpatched");
  });
});
