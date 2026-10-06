/** A program's published rules (db/migrations/202610060009). Versions are append-only;
 * every report is bound to the version in effect when it was submitted. */
export type ProgramDisclosureMode = "coordinated" | "full" | "none";

export type ProgramPolicy = {
  id: string;
  programId: string;
  versionNumber: number;
  rulesOfEngagement: string;
  /** The program commits to the platform's safe harbor terms (/safe-harbor). */
  safeHarbor: boolean;
  disclosureMode: ProgramDisclosureMode;
  /** Coordinated disclosure only: days after resolution before the researcher may publish. */
  disclosureDays: number | null;
  firstResponseTargetHours: number | null;
  triageTargetHours: number | null;
  resolutionTargetDays: number | null;
  changeNote: string | null;
  publishedAt: string;
};

export type ProgramPolicyInput = {
  rulesOfEngagement: string;
  safeHarbor: boolean;
  disclosureMode: ProgramDisclosureMode;
  disclosureDays: number | null;
  firstResponseTargetHours: number | null;
  triageTargetHours: number | null;
  resolutionTargetDays: number | null;
  changeNote?: string;
};

/** One response target on one report: when it was due, when (if) it was met, and whether
 * it was missed -- an unmet target past its due time counts as missed. */
export type SlaTarget = { dueAt: string; metAt: string | null; breached: boolean };

export type ReportSla = {
  policyVersionNumber: number;
  firstResponse: SlaTarget | null;
  triage: SlaTarget | null;
  resolution: SlaTarget | null;
};

export type SlaCount = { tracked: number; breached: number };

export type OrganizationSlaSummary = {
  programId: string;
  reportCount: number;
  firstResponse: SlaCount;
  triage: SlaCount;
  resolution: SlaCount;
  medianFirstResponseHours: number | null;
};
