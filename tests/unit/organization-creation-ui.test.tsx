import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreateOrganizationDialog } from "../../components/organizations/create-organization-dialog";
import { PendingInvitationCard } from "../../components/organizations/pending-invitation-card";
import type { PendingInvitationForUser } from "../../types/organization";

// PendingInvitationCard calls useRouter() unconditionally (even though it's only invoked
// inside the accept handler, not during render) -- outside an actual Next.js app router,
// that hook throws rather than degrading gracefully (unlike usePathname, used elsewhere
// in this codebase, which returns null outside a router). Mocked here so static rendering
// can be tested at all. vi.mock calls are hoisted above the imports above by vitest.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const invitation: PendingInvitationForUser = {
  id: "invite-1",
  organizationId: "org-1",
  organizationName: "Acme Security",
  role: "program_manager",
  invitedByName: "Alice",
  expiresAt: "2099-01-01T00:00:00Z",
  createdAt: "2026-08-26T00:00:00Z",
};

describe("CreateOrganizationDialog", () => {
  it("defaults to closed, showing only the trigger", () => {
    const html = renderToStaticMarkup(<CreateOrganizationDialog />);
    expect(html).toContain("Create organization");
    expect(html).not.toContain("You'll be the owner");
  });

  it("supports a custom trigger label for the 'create another' case", () => {
    const html = renderToStaticMarkup(<CreateOrganizationDialog triggerLabel="Create another organization" />);
    expect(html).toContain("Create another organization");
  });
});

describe("PendingInvitationCard", () => {
  it("shows the real organization name, role, and inviter -- not a placeholder", () => {
    const html = renderToStaticMarkup(<PendingInvitationCard invitation={invitation} />);
    expect(html).toContain("Acme Security");
    expect(html).toContain("Program Manager");
    expect(html).toContain("Alice");
    expect(html).toContain("Accept");
    expect(html).toContain("Decline");
  });

  it("handles a missing inviter name gracefully instead of rendering 'null'", () => {
    const html = renderToStaticMarkup(<PendingInvitationCard invitation={{ ...invitation, invitedByName: null }} />);
    expect(html).not.toContain("null");
    expect(html).not.toContain("Invited by");
  });
});
