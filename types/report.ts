import type { ProgramAssetType, ScopeState } from "./scope";

export type ReportStatus = "new" | "triaging" | "needs_information" | "accepted" | "resolved" | "duplicate" | "informative" | "not_applicable" | "rejected";

/** `confirmedSeverity` on `Report` is the ONLY severity value any authorization, bounty,
 * or reputation logic ever reads -- organization-set, triage-only. `researcherSeverity`
 * (see below) is a second, advisory-only column no downstream logic trusts for anything;
 * see docs/decisions/0047-report-composer-weakness-impact-severity.md for why adding it
 * does not reopen 0009's original deferral. Reuses the exact taxonomy
 * components/ui/badge.tsx's SeverityBadge already uses. */
export type ReportSeverity = "none" | "low" | "medium" | "high" | "critical";

/** CVSS v3.1 base metrics -- optional, all-or-nothing, real standardized justification a
 * triager may attach when setting confirmedSeverity. Never authoritative on its own; see
 * supabase/migrations/202609030006_cvss_severity_scoring.sql and
 * docs/decisions/0061-cvss-severity-scoring.md. */
export type CvssAttackVector = "network" | "adjacent" | "local" | "physical";
export type CvssAttackComplexity = "low" | "high";
export type CvssPrivilegesRequired = "none" | "low" | "high";
export type CvssUserInteraction = "none" | "required";
export type CvssScope = "unchanged" | "changed";
export type CvssImpact = "none" | "low" | "high";

export type CvssMetrics = {
  attackVector: CvssAttackVector;
  attackComplexity: CvssAttackComplexity;
  privilegesRequired: CvssPrivilegesRequired;
  userInteraction: CvssUserInteraction;
  scope: CvssScope;
  confidentialityImpact: CvssImpact;
  integrityImpact: CvssImpact;
  availabilityImpact: CvssImpact;
};

/** A fixed, real vulnerability-category taxonomy the researcher selects at submission --
 * pure metadata, never authorization-bearing. See
 * docs/decisions/0047-report-composer-weakness-impact-severity.md and
 * lib/report-weakness-labels.ts for display labels. */
/** Operational priority, P0 (critical) to P4 (informational). Distinct from severity: see
 * lib/report-priority.ts and db/migrations/202610260003_report_priority.sql. */
export type ReportPriority = "p0" | "p1" | "p2" | "p3" | "p4";

export type ReportWeaknessType =
  | "cross_site_scripting"
  | "sql_injection"
  | "ssrf"
  | "idor"
  | "broken_authentication"
  | "broken_access_control"
  | "csrf"
  | "remote_code_execution"
  | "information_disclosure"
  | "insecure_deserialization"
  | "security_misconfiguration"
  | "injection_other"
  | "business_logic"
  | "denial_of_service"
  | "cryptographic_failure"
  | "insecure_file_upload"
  | "api_security"
  | "other";

/**
 * A report's target/scope fields are a frozen snapshot of the authorization decision
 * made at submission time -- matchedScopeState/matchedTarget do not change if the
 * underlying scope entry is later edited or removed. See
 * docs/decisions/0008-report-authorization-and-scope-snapshot.md.
 *
 * confirmedSeverity/duplicateOfReportId/resolutionSummary are all "what is true now"
 * (0009) -- prior values live in the audit trail, never in these columns.
 * informationRequestReason/researcherResponse were superseded by report_messages in
 * 0010 and no longer exist on this type.
 */
export type Report = {
  id: string;
  programId: string;
  organizationId: string;
  researcherId: string;
  researcherName: string;
  title: string;
  description: string;
  assetType: ProgramAssetType;
  target: string;
  displayTarget: string;
  matchedScopeEntryId: string | null;
  matchedScopeState: ScopeState;
  matchedTarget: string;
  status: ReportStatus;
  confirmedSeverity: ReportSeverity | null;
  /** Explicit triager-set priority; null means it follows confirmedSeverity (effectivePriority). */
  priority: ReportPriority | null;
  duplicateOfReportId: string | null;
  resolutionSummary: string | null;
  weaknessType: ReportWeaknessType | null;
  impact: string | null;
  researcherSeverity: ReportSeverity | null;
  cvssMetrics: CvssMetrics | null;
  cvssBaseScore: number | null;
  /** CVSS 4.0 base vector and score (202610220006); null when not scored with v4. */
  cvss4Vector?: string | null;
  /** The researcher's own CVSS at submission (scored server-side). Advisory; separate from the triager's CVSS. */
  researcherCvss?: { version: "4.0" | "3.1"; vector: string; score: number } | null;
  cvss4Score?: number | null;
  /** The staff member working this report (202610060011); null when unassigned. */
  assigneeId: string | null;
  assigneeName: string | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

/** researcher: the submitting researcher; organization: any authorized triager/manager/
 * admin. Derived server-side from reports.researcher_id, never client-supplied. See
 * docs/decisions/0010-report-evidence-and-communication.md. */
export type ReportAuthorContext = "researcher" | "organization";

/** researcher_visible: readable by the submitting researcher and the organization.
 * internal: organization only -- never reachable by the researcher, even for their own
 * report. A researcher-authored item is always researcher_visible; only an organization
 * actor may choose internal. See docs/decisions/0010-report-evidence-and-communication.md. */
export type ReportVisibility = "researcher_visible" | "internal";

export type ReportEvidenceType = "text" | "code" | "url" | "log" | "file";

/** A communication record, never an edit to the original report. Append-only -- no
 * update/delete in this slice. See docs/decisions/0010-report-evidence-and-communication.md. */
export type ReportMessage = {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  authorContext: ReportAuthorContext;
  visibility: ReportVisibility;
  body: string;
  createdAt: string;
};

/** A supporting-material record, distinct from communication. Append-only, and once
 * uploaded, immutable -- no update/delete in this slice.
 *
 * Exactly one shape per row, enforced by a database check constraint: `evidenceType ===
 * "file"` means `content` is null and every file field is populated; every other type
 * means `content` is populated and every file field is null. `objectKey` is an opaque
 * server-generated reference, never exposed as a usable path -- downloading requires a
 * fresh, short-lived, authorization-gated signed URL (see
 * services/report-file-evidence.ts). `sha256`/`sizeBytes` are server-derived from the
 * actual uploaded bytes, never trusted from the client. `contentType` is stored,
 * unvalidated, display-only metadata -- see
 * docs/decisions/0011-binary-evidence-storage.md. */
export type ReportEvidence = {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  authorContext: ReportAuthorContext;
  visibility: ReportVisibility;
  evidenceType: ReportEvidenceType;
  content: string | null;
  objectKey: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  createdAt: string;
};

/** A researcher added to another researcher's report, splitting the eventual bounty.
 * `bountySplitPercent` is this collaborator's own share only -- the submitter is never a
 * row here; their share is 100 minus the sum of every collaborator's percent, computed at
 * render time (see the report detail page), never stored, so it can never drift out of
 * sync. See docs/decisions/0064-report-collaboration-scope.md. */
export type ReportCollaborator = {
  id: string;
  researcherId: string;
  displayName: string;
  publicUsername: string | null;
  bountySplitPercent: number;
  addedAt: string;
};

/** A single retest attempt on an already-resolved report -- see
 * docs/decisions/0075/supabase/migrations/202609050005_report_retest.sql. Never touches
 * the report's own status; a report can have many of these over time, newest first. */
export type ReportRetestStatus = "requested" | "confirmed_fixed" | "still_vulnerable" | "escalated";
export type ReportRetest = {
  id: string;
  reportId: string;
  requestedBy: string;
  status: ReportRetestStatus;
  requesterNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNotes: string | null;
  escalatedBy: string | null;
  escalatedAt: string | null;
  requestedAt: string;
};

/** A researcher-initiated dispute over a terminal report's outcome, severity, or bounty --
 * see supabase/migrations/202609050006_report_mediation.sql. Resolved by the
 * organization's own owner/security_admin, never a platform-level adjudicator (none exists
 * yet -- see that migration's own comment on why this doesn't wait on that). */
export type ReportMediationStatus = "open" | "escalated" | "resolved" | "declined";
export type ReportMediationReason = "disagree_with_outcome" | "disagree_with_severity" | "disagree_with_bounty" | "unresponsive_communication" | "other";
export type ReportMediation = {
  id: string;
  reportId: string;
  openedBy: string;
  reason: ReportMediationReason;
  status: ReportMediationStatus;
  description: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  escalatedBy: string | null;
  escalatedAt: string | null;
  openedAt: string;
};

/** The triage inbox's workload-at-a-glance counts (see services/reports.ts's
 * getReportInboxWorkloadSummary) -- three real counts, each a cheap `count: "exact",
 * head: true` query against the same RLS-scoped `reports` table the inbox itself reads,
 * never a fabricated number. `unresolvedHighSeverityCount` counts confirmed high/critical
 * severity reports still in a non-terminal status -- the same OPEN_REPORT_STATUSES set
 * listOpenReportsForOrganization already uses, not a new definition of "open." */
export type ReportInboxWorkloadSummary = {
  newCount: number;
  needsInformationCount: number;
  unresolvedHighSeverityCount: number;
};

/** The researcher's own cross-program report list -- see services/reports.ts's
 * listMyReports and docs/decisions/0008 for why this is its own shape rather than the
 * full Report (no researcherName: the viewer already knows it's themselves). */
export type ReportSummary = {
  id: string;
  programId: string;
  organizationId: string;
  programName: string;
  organizationName: string;
  title: string;
  displayTarget: string;
  status: ReportStatus;
  /** Null for a report with no organization-confirmed severity yet, and for any summary
   * sourced from an RPC that doesn't return this column (see services/reports.ts's
   * MyReportRow) -- never a placeholder value, just an honest absence. */
  confirmedSeverity: ReportSeverity | null;
  submittedAt: string;
};

/** requested -> approved | declined; approved -> unpublished; declined/unpublished ->
 * requested (asked again). An approved disclosure is public once publishedAt has passed --
 * coordinated programs schedule it after resolution. See
 * db/migrations/202610060012_disclosure_lifecycle.sql. */
export type ReportDisclosureStatus = "requested" | "approved" | "declined" | "unpublished";

export type ReportDisclosure = {
  id: string;
  reportId: string;
  organizationId: string;
  status: ReportDisclosureStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  declineReason: string | null;
  /** The proposed public write-up -- redacted by the organization before approval. */
  draftTitle: string | null;
  draftSummary: string | null;
  publishedTitle: string | null;
  publishedSummary: string | null;
  /** May be in the future: approved and scheduled, not yet public. */
  publishedAt: string | null;
  unpublishedAt: string | null;
  unpublishReason: string | null;
};

/** An organization's queue of disclosure requests awaiting a decision. */
export type PendingReportDisclosure = {
  id: string;
  reportId: string;
  programId: string;
  reportTitle: string;
  programName: string;
  researcherDisplayName: string;
  requestedAt: string;
};

/** The anonymous-readable public feed -- see list_public_disclosures's own comment for
 * why this is a deliberately minimal snapshot, never the live report. */
export type PublicDisclosure = {
  reportId: string;
  publishedTitle: string | null;
  publishedSummary: string | null;
  /** Severity as approved, frozen at publication -- not the live report. */
  confirmedSeverity: ReportSeverity | null;
  programId: string;
  programName: string;
  organizationId: string;
  organizationName: string;
  /** Only when the researcher opted into a public profile. */
  researcherUsername: string | null;
  publishedAt: string | null;
};
