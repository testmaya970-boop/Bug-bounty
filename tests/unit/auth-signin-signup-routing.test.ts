import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { signInWithPassword, signUpWithPassword } from "@/services/auth";
import { createOrganization, listCurrentUserOrganizations } from "@/services/organizations";
import { listMyProgramParticipations } from "@/services/program-researchers";
import { isPlatformAdmin } from "@/services/platform-operations";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/auth")>();
  return { ...actual, signInWithPassword: vi.fn(), signUpWithPassword: vi.fn() };
});
vi.mock("@/services/organizations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/organizations")>();
  return { ...actual, listCurrentUserOrganizations: vi.fn(), createOrganization: vi.fn() };
});
vi.mock("@/services/program-researchers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/program-researchers")>();
  return { ...actual, listMyProgramParticipations: vi.fn() };
});
vi.mock("@/services/platform-operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/platform-operations")>();
  return { ...actual, isPlatformAdmin: vi.fn() };
});

const mockedRedirect = vi.mocked(redirect);
const mockedSignIn = vi.mocked(signInWithPassword);
const mockedSignUp = vi.mocked(signUpWithPassword);
const mockedListOrgs = vi.mocked(listCurrentUserOrganizations);
const mockedListParticipations = vi.mocked(listMyProgramParticipations);
const mockedCreateOrganization = vi.mocked(createOrganization);
const mockedIsPlatformAdmin = vi.mocked(isPlatformAdmin);

beforeEach(() => {
  mockedRedirect.mockReset();
  mockedSignIn.mockReset();
  mockedSignUp.mockReset();
  mockedListOrgs.mockReset();
  mockedListParticipations.mockReset();
  mockedCreateOrganization.mockReset();
  // Every existing test below predates platform-admin-first routing and asserts on a
  // non-admin account -- default every case to false so they keep exercising the
  // org/researcher branches unchanged; the dedicated platform-admin test overrides this.
  mockedIsPlatformAdmin.mockResolvedValue(false);
});

describe("signUpAction: email confirmation is always required now -- no role or organization is created here", () => {
  it("never redirects -- every successful signup shows the 'check your email' state, since confirmation is mandatory", async () => {
    mockedSignUp.mockResolvedValue({ status: "confirm_email", email: "pending@example.test" });
    const { signUpAction } = await import("../../actions/auth");

    const result = await signUpAction({ email: "pending@example.test", password: "a-real-password-1", intent: "researcher" });

    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, status: "confirm_email", email: "pending@example.test" });
  });

  it("rejects a personal-email-domain organization signup before ever calling signUpWithPassword", async () => {
    const { signUpAction } = await import("../../actions/auth");

    const result = await signUpAction({ email: "owner@gmail.com", password: "a-real-password-1", intent: "organization", companyName: "Acme" });

    expect(result).toEqual({ ok: false, code: "PERSONAL_EMAIL", message: "Use your work email address to create an organization account." });
    expect(mockedSignUp).not.toHaveBeenCalled();
  });

  it("never calls createOrganization directly -- organization auto-creation now happens in app/auth/confirm/route.ts, once the email is actually confirmed", async () => {
    mockedSignUp.mockResolvedValue({ status: "confirm_email", email: "owner@acme.test" });
    const { signUpAction } = await import("../../actions/auth");

    await signUpAction({ email: "owner@acme.test", password: "a-real-password-1", intent: "organization", companyName: "Acme" });

    expect(mockedCreateOrganization).not.toHaveBeenCalled();
  });

  it("passes a researcher's chosen display name, username, intent, and companyName through as signup metadata (carried on the verification token, see services/auth.ts)", async () => {
    mockedSignUp.mockResolvedValue({ status: "confirm_email", email: "r@example.test" });
    const { signUpAction } = await import("../../actions/auth");

    await signUpAction({ email: "r@example.test", password: "a-real-password-1", intent: "researcher", displayName: "Riley Researcher", username: "riley_r" });

    expect(mockedSignUp).toHaveBeenCalledWith("r@example.test", "a-real-password-1", { displayName: "Riley Researcher", username: "riley_r", intent: "researcher", companyName: undefined });
  });
});

// signInAction deliberately returns its destination rather than calling redirect() here --
// redirect() inside a Server Action invoked via startTransition (as SignInForm does)
// resolves as a client-side RSC "soft" navigation whose own follow-up fetch was confirmed
// live to not reliably carry the session cookie the sign-in response just set (see
// SignInResult's own comment in actions/auth.ts). The caller (SignInForm) hard-navigates
// via window.location.href instead. mockedRedirect is still asserted as NOT called in each
// case below, since a regression back to a server-side redirect() would silently
// reintroduce that exact cookie-race bug.
describe("signInAction: destination is the account's own real, server-derived context -- never a guessed role", () => {
  it("sends an organization-only account (no researcher participation) to /organizations", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([{ id: "org-1", slug: "acme", name: "Acme", role: "owner", status: "active" }]);
    mockedListParticipations.mockResolvedValue([]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "owner@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/organizations" });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("sends a researcher-only account (no organization membership) to '/', the real researcher dashboard -- never /programs (the public program registry)", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "researcher@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/" });
    // listMyProgramParticipations is only ever consulted once an organization is already
    // known to exist (to distinguish org-only from both) -- a researcher-only account
    // never needs that second query at all.
    expect(mockedListParticipations).not.toHaveBeenCalled();
  });

  it("sends an account with both organization membership and researcher participation to '/', the shared context chooser", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([{ id: "org-1", slug: "acme", name: "Acme", role: "owner", status: "active" }]);
    mockedListParticipations.mockResolvedValue([{ programId: "p-1", organizationId: "org-2", programName: "Bounty", organizationName: "Other Org", status: "active", programStatus: "active", joinedAt: "2026-01-01" }]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "both@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/" });
  });

  it("sends a brand-new account (neither organization nor researcher yet) to '/'", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "new@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/" });
    expect(mockedListParticipations).not.toHaveBeenCalled();
  });

  it("honors a real, safe redirectTo over the derived default, without even checking organizations/participations", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "u@example.test", password: "a-real-password-1", redirectTo: "/organizations/org-1/programs" });

    expect(result).toEqual({ ok: true, destination: "/organizations/org-1/programs" });
    expect(mockedListOrgs).not.toHaveBeenCalled();
    expect(mockedListParticipations).not.toHaveBeenCalled();
  });

  it("falls back to the derived default for an unsafe redirectTo (open-redirect guard unchanged)", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([]);
    mockedListParticipations.mockResolvedValue([]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "u@example.test", password: "a-real-password-1", redirectTo: "//evil.test" });

    expect(result).toEqual({ ok: true, destination: "/" });
  });

  it("routes an MFA-enrolled account to /mfa/verify with its real destination preserved, never straight to the destination itself", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: true, userId: "user-1" });
    mockedListOrgs.mockResolvedValue([{ id: "org-1", slug: "acme", name: "Acme", role: "owner", status: "active" }]);
    mockedListParticipations.mockResolvedValue([]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "mfa@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/mfa/verify?redirectTo=%2Forganizations" });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("sends a platform admin to /platform/programs, never the researcher dashboard -- confirmed live as a real gap: a platform-admin-only test account (no organizations, no researcher participation) landed on the ordinary 'You haven't submitted any reports yet' researcher Home with nothing admin-shaped about it", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "admin-1" });
    mockedIsPlatformAdmin.mockResolvedValue(true);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "admin@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/platform/programs" });
    // Platform-admin status is checked first and short-circuits the rest of the routing
    // decision -- an admin's org/researcher standing (if any) is irrelevant to where they land.
    expect(mockedListOrgs).not.toHaveBeenCalled();
    expect(mockedListParticipations).not.toHaveBeenCalled();
  });

  it("still sends a platform admin to /platform/programs even when they ALSO have real organization and researcher standing -- platform-admin status takes priority over any other real context this account might have", async () => {
    mockedSignIn.mockResolvedValue({ mfaRequired: false, userId: "admin-2" });
    mockedIsPlatformAdmin.mockResolvedValue(true);
    mockedListOrgs.mockResolvedValue([{ id: "org-1", slug: "acme", name: "Acme", role: "owner", status: "active" }]);
    mockedListParticipations.mockResolvedValue([{ programId: "p-1", organizationId: "org-2", programName: "Bounty", organizationName: "Other Org", status: "active", programStatus: "active", joinedAt: "2026-01-01" }]);
    const { signInAction } = await import("../../actions/auth");

    const result = await signInAction({ email: "admin-both@example.test", password: "a-real-password-1" });

    expect(result).toEqual({ ok: true, destination: "/platform/programs" });
  });
});

