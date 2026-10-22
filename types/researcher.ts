import type { ProgramStatus } from "./program";

export type ProgramResearcherStatus = "active" | "suspended" | "revoked";
export type ProgramAccessSource = "invitation" | "public" | "request";

/** A researcher's participation record for one program -- a third, separate
 * authorization domain from organization membership and program management. See
 * docs/decisions/0007-researcher-access.md. */
export type ProgramResearcherRecord = {
  programId: string;
  organizationId: string;
  userId: string;
  status: ProgramResearcherStatus;
  source: ProgramAccessSource;
  invitedBy: string | null;
  joinedAt: string;
  suspendedAt: string | null;
  revokedAt: string | null;
  updatedAt: string;
  username: string;
  displayName: string;
  /** The researcher's Unpatched email alias -- org staff never see the real address. */
  aliasEmail: string | null;
};

export type ProgramInvitationRecord = {
  id: string;
  programId: string;
  organizationId: string;
  email: string;
  invitedBy: string;
  message: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** A program invitation surfaced to the invitee themselves, not to a program manager
 * -- includes the program and organization names, which the invitee has no other RLS
 * path to read before they have any relationship to either. */
export type PendingProgramInvitationForResearcher = {
  id: string;
  programId: string;
  programName: string;
  organizationName: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

/** The signed-in researcher's own view of a program they participate in. */
export type ProgramParticipation = {
  programId: string;
  organizationId: string;
  programName: string;
  programStatus: ProgramStatus;
  organizationName: string;
  status: ProgramResearcherStatus;
  joinedAt: string;
};
