import type { ProgramAssetType, ScopeState } from "./scope";
import type { ResearcherFocusArea } from "./researcher-identity";

export type ProgramStatus = "draft" | "review" | "active" | "paused" | "closed";
export type ProgramMemberRole = "manager";
export type ProgramVisibility = "private" | "public";

/** bounty: may configure a paid bounty policy. vdp: vulnerability-disclosure-only, no
 * payment ever -- enforced by create_bounty_policy_version rejecting a vdp program
 * outright, not just a UI convention. Set once at creation, never changed afterward in
 * this slice. See supabase/migrations/202609030002_vdp_vs_bounty_program_type.sql. */
export type ProgramType = "bounty" | "vdp";

/** The HackerOne-style engagement category this program is -- a real, coexisting column
 * with ProgramType (above), never conflated with it: ProgramType gates a narrower
 * financial-workflow question (may this program configure a paid bounty policy);
 * EngagementType answers a broader category question (what kind of security engagement
 * is this) used to group/filter the organization's own Engagements list. Set once at
 * creation, never changed afterward in this slice -- identical mutability rule to
 * ProgramType, same reasoning. See
 * supabase/migrations/202609070002_engagement_type.sql. */
export type EngagementType = "bug_bounty" | "response" | "pentest" | "code_audit" | "challenge" | "campaign" | "spot_check";

export type ProgramSummary = {
  id: string;
  organizationId: string;
  name: string;
  status: ProgramStatus;
  visibility: ProgramVisibility;
  programType: ProgramType;
  engagementType: EngagementType;
  description: string | null;
  requiresKyc: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

/** A program's public-safe view -- exactly the columns list_public_programs/
 * get_public_program project, never the full ProgramSummary shape (which includes
 * createdBy/createdByName, not meant for an anonymous audience). See
 * docs/decisions/0041-public-program-discovery-vertical-slice.md.
 *
 * bountyMin/Max/Currency, activeResearcherCount, resolvedReportCount, assetTypes are all
 * real, live-computed facts (docs/decisions/0054) -- never a cached, estimated, or
 * invented number. bountyMin/Max are the aggregate range only (min across every severity
 * tier's floor, max across every tier's ceiling) -- the full per-severity breakdown stays
 * gated to org admins/program members/authorized researchers (unchanged RLS, 0013). A
 * program with no bounty policy configured has bountyMin/Max/Currency all null, never a
 * fabricated $0 range. */
export type PublicProgramSummary = {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
  status: ProgramStatus;
  description: string | null;
  focusAreas: ResearcherFocusArea[];
  assetTypes: ProgramAssetType[];
  bountyMinMinorUnits: number | null;
  bountyMaxMinorUnits: number | null;
  bountyCurrency: string | null;
  activeResearcherCount: number;
  resolvedReportCount: number;
  updatedAt: string;
};

/** list_top_bounty_programs' row shape -- the curated "highest-paying" section. Only ever
 * includes a program with a real, currently-active bounty policy. */
export type TopBountyProgram = {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
  status: ProgramStatus;
  bountyMinMinorUnits: number;
  bountyMaxMinorUnits: number;
  bountyCurrency: string;
};

export type PublicProgramScopeEntry = {
  id: string;
  assetType: ProgramAssetType;
  displayTarget: string;
  scopeState: ScopeState;
  description: string | null;
};

/** The signed-in user's own program_members row for a given program, if any -- distinct
 * from organization-role-derived oversight access (see docs/decisions/0004-program-authorization.md). */
export type ProgramMemberRecord = {
  programId: string;
  organizationId: string;
  userId: string;
  role: ProgramMemberRole;
  addedBy: string | null;
  createdAt: string;
  displayName: string;
};
