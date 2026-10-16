import { describe, expect, it } from "vitest";
import {
  canChangeRoles,
  canCreateProgram,
  canGrantRole,
  canManageMembers,
  describeOrganizationAccess,
  describeRoleChangeImpact,
  isLastActiveOwner,
} from "../../services/authorization";


describe("organization role capability model", () => {
  it("lets owner and security_admin manage members, and no one else", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("security_admin")).toBe(true);
    expect(canManageMembers("program_manager")).toBe(false);
    expect(canManageMembers("triager")).toBe(false);
    expect(canManageMembers("billing_admin")).toBe(false);
  });

  it("restricts organization role changes to owner only", () => {
    expect(canChangeRoles("owner")).toBe(true);
    expect(canChangeRoles("security_admin")).toBe(false);
  });

  it("restricts granting ownership to an existing owner", () => {
    expect(canGrantRole("owner", "owner")).toBe(true);
    expect(canGrantRole("security_admin", "owner")).toBe(false);
    expect(canGrantRole("security_admin", "triager")).toBe(true);
    expect(canGrantRole("triager", "triager")).toBe(false);
  });

  it("gives every role a non-empty label and a role-appropriate access summary", () => {
    const summary = describeOrganizationAccess("program_manager");
    expect(summary.organizationAccess).toBe("Limited");
    expect(summary.can.join(" ")).toMatch(/programs they are assigned to/);
    expect(summary.cannot).toContain("Manage organization members or roles");
  });

  it("gives billing_admin payments -- and explicitly no report contents (202609250012)", () => {
    const summary = describeOrganizationAccess("billing_admin");
    expect(summary.can.join(" ")).toMatch(/payment/i);
    expect(summary.cannot.join(" ")).toMatch(/report contents/i);
  });

  it("describes a real capability delta when a role changes, not generic text", () => {
    const impact = describeRoleChangeImpact("triager", "security_admin");
    expect(impact).toContain("Gains:");
    expect(impact).toMatch(/Invite, suspend, and remove members/);
  });

  it("reports no change when the role is unchanged", () => {
    expect(describeRoleChangeImpact("owner", "owner")).toBe("This member's role and access will not change.");
  });
});

describe("program creation capability (see docs/decisions/0004-program-authorization.md)", () => {
  it("lets owner and security_admin create programs, and no one else -- not even the org-level program_manager role", () => {
    expect(canCreateProgram("owner")).toBe(true);
    expect(canCreateProgram("security_admin")).toBe(true);
    expect(canCreateProgram("program_manager")).toBe(false);
    expect(canCreateProgram("triager")).toBe(false);
    expect(canCreateProgram("billing_admin")).toBe(false);
  });
});

describe("last active owner detection", () => {
  const members = [
    { userId: "u1", role: "owner" as const, status: "active" as const },
    { userId: "u2", role: "security_admin" as const, status: "active" as const },
  ];

  it("flags the sole active owner", () => expect(isLastActiveOwner(members, "u1")).toBe(true));
  it("does not flag a non-owner", () => expect(isLastActiveOwner(members, "u2")).toBe(false));
  it("does not flag an owner when another active owner exists", () => {
    const withSecondOwner = [...members, { userId: "u3", role: "owner" as const, status: "active" as const }];
    expect(isLastActiveOwner(withSecondOwner, "u1")).toBe(false);
  });
  it("does not flag an owner whose status is not active", () => {
    expect(isLastActiveOwner([{ userId: "u1", role: "owner", status: "removed" }], "u1")).toBe(false);
  });
  it("ignores a suspended second owner -- they cannot act, so they do not relieve the constraint", () => {
    const withSuspendedOwner = [...members, { userId: "u3", role: "owner" as const, status: "suspended" as const }];
    expect(isLastActiveOwner(withSuspendedOwner, "u1")).toBe(true);
  });
});
