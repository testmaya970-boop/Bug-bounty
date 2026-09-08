import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InviteResearcherDialog } from "../../components/programs/invite-researcher-dialog";
import { PendingProgramInvitationCard } from "../../components/programs/pending-program-invitation-card";
import { ProgramParticipationCard } from "../../components/programs/program-participation-card";
import { ResearcherStatusBadge } from "../../components/ui/badge";
import type { PendingProgramInvitationForResearcher, ProgramParticipation } from "../../types/researcher";

// Both components call useRouter() unconditionally, same reason as
// CreateOrganizationDialog/PendingInvitationCard -- must be mocked for static rendering.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const invitation: PendingProgramInvitationForResearcher = {
  id: "invite-1",
  programId: "prog-1",
  programName: "Acme Bounty",
  organizationName: "Acme Security",
  invitedByName: "Alice",
  expiresAt: "2099-01-01T00:00:00Z",
  createdAt: "2026-08-26T00:00:00Z",
};

const participation: ProgramParticipation = {
  programId: "prog-1",
  organizationId: "org-1",
  programName: "Acme Bounty",
  programStatus: "draft",
  organizationName: "Acme Security",
  status: "active",
  joinedAt: "2026-08-26T00:00:00Z",
};

describe("InviteResearcherDialog", () => {
  it("defaults to closed, showing only the trigger", () => {
    const html = renderToStaticMarkup(<InviteResearcherDialog organizationId="org-1" programId="prog-1" />);
    expect(html).toContain("Invite researcher");
    expect(html).not.toContain("does not need an existing Unpatched account");
  });
});

describe("PendingProgramInvitationCard", () => {
  it("shows the real program name, organization, and inviter -- not a placeholder", () => {
    const html = renderToStaticMarkup(<PendingProgramInvitationCard invitation={invitation} />);
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Acme Security");
    expect(html).toContain("Alice");
    expect(html).toContain("Accept");
    expect(html).toContain("Decline");
  });

  it("handles a missing inviter name gracefully instead of rendering 'null'", () => {
    const html = renderToStaticMarkup(<PendingProgramInvitationCard invitation={{ ...invitation, invitedByName: null }} />);
    expect(html).not.toContain("null");
    expect(html).not.toContain("Invited by");
  });
});

describe("ProgramParticipationCard", () => {
  it("links to the real nested program URL using the returned organizationId", () => {
    const html = renderToStaticMarkup(<ProgramParticipationCard participation={participation} />);
    expect(html).toContain(`/organizations/${participation.organizationId}/programs/${participation.programId}`);
    expect(html).toContain("Acme Bounty");
    expect(html).toContain("Acme Security");
  });

  it("tells an active researcher on an active program they can act now", () => {
    const html = renderToStaticMarkup(<ProgramParticipationCard participation={{ ...participation, status: "active", programStatus: "active" }} />);
    expect(html).toContain("You can view scope and submit reports.");
  });

  it("tells a suspended researcher they cannot view scope or submit, never a misleading action hint", () => {
    const html = renderToStaticMarkup(<ProgramParticipationCard participation={{ ...participation, status: "suspended" }} />);
    expect(html).toContain("suspended");
    expect(html).toContain("cannot view scope or submit reports");
    expect(html).not.toContain("You can view scope and submit reports.");
  });

  it("tells an active researcher on a paused program that new reports are not currently accepted", () => {
    const html = renderToStaticMarkup(<ProgramParticipationCard participation={{ ...participation, status: "active", programStatus: "paused" }} />);
    expect(html).toContain("not currently accepting new reports");
  });

  it("visually recedes a non-active participation without hiding it -- historical access stays findable", () => {
    const activeHtml = renderToStaticMarkup(<ProgramParticipationCard participation={{ ...participation, status: "active" }} />);
    const suspendedHtml = renderToStaticMarkup(<ProgramParticipationCard participation={{ ...participation, status: "suspended" }} />);
    expect(activeHtml).not.toContain("opacity-70");
    expect(suspendedHtml).toContain("opacity-70");
    expect(suspendedHtml).toContain("Acme Bounty");
  });
});

describe("ResearcherStatusBadge", () => {
  it("renders a distinct, human-readable, non-color-only label for every status", () => {
    for (const status of ["active", "suspended", "revoked"] as const) {
      const html = renderToStaticMarkup(<ResearcherStatusBadge status={status} />);
      expect(html.toLowerCase()).toContain(status);
    }
  });
});
