import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
import { AccessSummary } from "../../components/organizations/access-summary";
import { MemberTable } from "../../components/organizations/member-table";
import { PendingInvitationsPanel } from "../../components/organizations/pending-invitations-panel";
import { InviteMemberDialog } from "../../components/organizations/invite-member-dialog";
import { RoleChangeDialog } from "../../components/organizations/role-change-dialog";
import { RemoveMemberDialog, SuspendMemberDialog } from "../../components/organizations/member-action-dialogs";
import { MemberStatusBadge, PendingInvitationBadge, RoleBadge } from "../../components/ui/badge";
import type { OrganizationInvitationRecord, OrganizationMemberRecord } from "../../types/organization";

const owner: OrganizationMemberRecord = {
  organizationId: "org-1",
  userId: "user-1",
  role: "owner",
  status: "active",
  invitedBy: null,
  joinedAt: "2026-08-01T00:00:00Z",
  suspendedAt: null,
  removedAt: null,
  updatedAt: "2026-08-01T00:00:00Z",
  username: "alice",
  displayName: "Alice Rivera",
  email: "alice@example.com",
};

const triager: OrganizationMemberRecord = { ...owner, userId: "user-2", role: "triager", username: "bob", displayName: "Bob Chen", email: "bob@example.com" };

const pendingInvitation: OrganizationInvitationRecord = {
  id: "invite-1",
  organizationId: "org-1",
  email: "carol@example.com",
  role: "program_manager",
  invitedBy: "user-1",
  message: null,
  expiresAt: "2099-01-01T00:00:00Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-08-01T00:00:00Z",
};

describe("badges", () => {
  it("labels every organization role distinctly", () => {
    expect(renderToStaticMarkup(<RoleBadge role="security_admin" />)).toContain("Security Admin");
    expect(renderToStaticMarkup(<RoleBadge role="program_manager" />)).toContain("Program Manager");
  });

  it("gives member status a non-color text value", () => {
    const html = renderToStaticMarkup(<MemberStatusBadge status="suspended" />);
    expect(html).toContain("Suspended");
    expect(html).toContain("text-warning");
  });

  it("marks a pending invitation distinctly from an active status", () => {
    expect(renderToStaticMarkup(<PendingInvitationBadge />)).toContain("Pending");
  });
});

describe("AccessSummary", () => {
  it("shows full org access and no restrictions for an owner", () => {
    const html = renderToStaticMarkup(<AccessSummary role="owner" />);
    expect(html).toContain("Full");
    expect(html).toContain("Change organization roles");
  });

  it("shows limited access and explicit denials for a triager", () => {
    const html = renderToStaticMarkup(<AccessSummary role="triager" />);
    expect(html).toContain("Limited");
    expect(html).toContain("Manage organization or program membership");
  });

  it("always states program access honestly instead of fabricating a per-member program list or count", () => {
    const html = renderToStaticMarkup(<AccessSummary role="program_manager" />);
    expect(html).toContain("Program-level access is assigned separately, within each program.");
  });

  it("surfaces the billing_admin scope note", () => {
    const html = renderToStaticMarkup(<AccessSummary role="billing_admin" />);
    expect(html).toContain("not implemented");
  });
});

describe("MemberTable", () => {
  it("renders identity, role, status, and a link into the member detail route for every row", () => {
    const html = renderToStaticMarkup(<MemberTable organizationId="org-1" members={[owner, triager]} lastActivityByUserId={{}} />);
    expect(html).toContain("Alice Rivera");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("Bob Chen");
    expect(html).toContain("/organizations/org-1/members/user-1");
    expect(html).toContain("/organizations/org-1/members/user-2");
    expect(html).toContain("No recorded activity");
  });

  it("uses a real recorded timestamp when last-activity data is available, not a placeholder", () => {
    const html = renderToStaticMarkup(<MemberTable organizationId="org-1" members={[owner]} lastActivityByUserId={{ "user-1": "2026-08-20T00:00:00Z" }} />);
    expect(html).not.toContain("No recorded activity");
  });
});

describe("PendingInvitationsPanel", () => {
  it("renders the exact empty-state copy when there is nothing pending", () => {
    const html = renderToStaticMarkup(<PendingInvitationsPanel organizationId="org-1" invitations={[]} canManage />);
    expect(html).toContain("No pending invitations");
    expect(html).toContain("Invitations you send will appear here until accepted or expired.");
  });

  it("lists a pending invitation with its role, and hides admin actions from a non-manager", () => {
    const html = renderToStaticMarkup(<PendingInvitationsPanel organizationId="org-1" invitations={[pendingInvitation]} canManage={false} />);
    expect(html).toContain("carol@example.com");
    expect(html).toContain("Program Manager");
    expect(html).not.toContain("Resend");
    expect(html).not.toContain("Cancel invitation");
  });
});

describe("dialogs default to closed and only show their trigger", () => {
  it("InviteMemberDialog", () => {
    const html = renderToStaticMarkup(<InviteMemberDialog organizationId="org-1" invitableRoles={["security_admin", "triager"]} />);
    expect(html).toContain("Invite member");
    expect(html).not.toContain("Send invitation");
  });

  it("RoleChangeDialog", () => {
    const html = renderToStaticMarkup(<RoleChangeDialog organizationId="org-1" targetUserId="user-2" targetName="Bob Chen" currentRole="triager" />);
    expect(html).toContain("Change role");
    expect(html).not.toContain("Confirm role change");
  });

  it("SuspendMemberDialog exposes its exact confirmation copy only once opened", () => {
    const html = renderToStaticMarkup(<SuspendMemberDialog organizationId="org-1" targetUserId="user-2" />);
    expect(html).toContain("Suspend");
    expect(html).not.toContain("lose access to the organization");
  });

  it("RemoveMemberDialog trigger is styled as a destructive action", () => {
    const html = renderToStaticMarkup(<RemoveMemberDialog organizationId="org-1" targetUserId="user-2" />);
    expect(html).toContain("bg-danger");
  });
});
