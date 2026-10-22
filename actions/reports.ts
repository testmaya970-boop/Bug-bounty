"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrganizationServiceError } from "@/services/rpc-error";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRequestLogging } from "@/lib/request-context";
import {
  acceptReport,
  addOrganizationEvidence,
  addReportCollaborator,
  addResearcherEvidence,
  decideReportRetest,
  escalateReportMediation,
  escalateReportRetest,
  getReport,
  listMyReports,
  listReportsForOrganization,
  listReportsForProgram,
  markDuplicate,
  markInformative,
  markNotApplicable,
  openReportMediation,
  postOrganizationMessage,
  postResearcherMessage,
  rejectReport,
  removeReportCollaborator,
  requestInformation,
  requestReportRetest,
  resolveReport,
  resolveReportMediation,
  setReportSeverity,
  startTriage,
  submitReport,
  assignReport,
  saveMyReportDraft,
  deleteMyReportDraft,
  setReportCvss4,
} from "@/services/reports";
import { getReportTimeline, type ReportTimelinePage } from "@/services/timeline";
import { getActorMembership } from "@/services/organization-members";
import { listProgramMembers } from "@/services/programs";
import { canCreateProgram } from "@/services/authorization";
import type { CvssMetrics, Report, ReportCollaborator, ReportEvidence, ReportMediation, ReportMessage, ReportRetest, ReportSeverity, ReportStatus, ReportSummary } from "@/types/report";
import type { Page } from "@/types/pagination";
import { verifyCaptcha } from "@/lib/integrations/captcha";
import { getMySubmissionStanding } from "@/services/submission-signal";
import { headers } from "next/headers";
import { CVSS4_VECTOR_PATTERN, cvss4Score } from "@/lib/cvss4";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

// Deliberately shallow -- length/presence only. Real validation, canonicalization, and
// scope matching are the database's job, never duplicated here. See
// docs/decisions/0008-report-authorization-and-scope-snapshot.md.
const assetTypeSchema = z.enum(["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"]);
const severitySchema = z.enum(["none", "low", "medium", "high", "critical"]);
const weaknessTypeSchema = z.enum([
  "cross_site_scripting",
  "sql_injection",
  "ssrf",
  "idor",
  "broken_authentication",
  "broken_access_control",
  "csrf",
  "remote_code_execution",
  "information_disclosure",
  "insecure_deserialization",
  "security_misconfiguration",
  "injection_other",
  "business_logic",
  "denial_of_service",
  "cryptographic_failure",
  "other",
]);
const visibilitySchema = z.enum(["researcher_visible", "internal"]);
const evidenceTypeSchema = z.enum(["text", "code", "url", "log"]);
const uuidSchema = z.string().uuid();

const submitSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  assetType: assetTypeSchema,
  targetInput: z.string().trim().min(1, "Enter a target.").max(2048, "Use 2048 characters or fewer."),
  title: z.string().trim().min(1, "Enter a report title.").max(200, "Use 200 characters or fewer."),
  description: z.string().trim().min(1, "Enter a description.").max(20000, "Use 20000 characters or fewer."),
  weaknessType: weaknessTypeSchema,
  impact: z.string().trim().min(1, "Describe the impact.").max(20000, "Use 20000 characters or fewer."),
  researcherSeverity: severitySchema.optional(),
  // The policy version the researcher accepted; the database refuses the report unless it
  // is exactly the version in effect (202610060009).
  acknowledgedPolicyVersion: z.number().int().positive().nullable().optional(),
});

export async function submitReportAction(input: z.infer<typeof submitSchema> & { captchaToken?: string }) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const user = await getCurrentUser();
  // New and limited-tier researchers prove they're human per report: that's where scripted
  // spam comes from. Trusted and standard researchers aren't asked (submission signal tiers).
  const standing = user ? await getMySubmissionStanding() : null;
  if (standing && (standing.tier === "new" || standing.tier === "limited")) {
    const forwarded = (await headers()).get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? null;
    if (!(await verifyCaptcha(input.captchaToken, forwarded))) {
      return { ok: false as const, code: "CAPTCHA_REQUIRED", message: "Complete the human check above the Submit button, then try again." };
    }
  }
  try {
    const report = await withRequestLogging("report.submit", { actorId: user?.id, organizationId: parsed.data.organizationId }, () =>
      submitReport(
        parsed.data.programId,
        parsed.data.assetType,
        parsed.data.targetInput,
        parsed.data.title,
        parsed.data.description,
        parsed.data.weaknessType,
        parsed.data.impact,
        parsed.data.researcherSeverity,
        parsed.data.acknowledgedPolicyVersion ?? null,
      ),
    );
    revalidatePath(`/organizations/${parsed.data.organizationId}/programs/${parsed.data.programId}`);
    revalidatePath("/reports");
    return { ok: true as const, data: report };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false as const, code: error.code, message: error.message };
    throw error;
  }
}

// --- Triage actions -------------------------------------------------------------------

function invalidInput(message = "Check the form and try again."): ActionResult<never> {
  return { ok: false, code: "INVALID_INPUT", message };
}

async function toResult<T>(promise: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

// The one revalidation call every real triage/communication/evidence mutation in this
// file already makes (14 call sites) -- covers the report's own detail page, both list
// surfaces over the same program (the dense full-table /reports inbox and the 3-column
// /inbox split-view), the org-wide cross-program Findings list, and the researcher's own
// /reports page. Previously missing the program's own /reports list path and /inbox
// entirely (a real, pre-existing gap this pass closes, not specific to /inbox: every one
// of these 14 mutations already needed it -- a triager acting from the report detail page
// left the Reports/Inbox list showing a stale status/severity until an unrelated
// navigation happened to refetch it).
function revalidateReportPaths(organizationId: string, programId: string, reportId: string) {
  revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
  revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports`);
  revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports/${reportId}`);
  revalidatePath(`/organizations/${organizationId}/programs/${programId}/inbox`);
  revalidatePath(`/organizations/${organizationId}/findings`);
  revalidatePath("/reports");
}

const reportActionBase = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema });

export async function startTriageAction(input: z.infer<typeof reportActionBase>) {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(startTriage(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const requestInformationSchema = reportActionBase.extend({ reason: z.string().trim().min(1, "Explain what information is needed.").max(5000, "Use 5000 characters or fewer.") });

export async function requestInformationAction(input: z.infer<typeof requestInformationSchema>) {
  const parsed = requestInformationSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(requestInformation(parsed.data.reportId, parsed.data.reason));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

export async function acceptReportAction(input: z.infer<typeof reportActionBase>) {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(acceptReport(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const markDuplicateSchema = reportActionBase.extend({ duplicateOfReportId: uuidSchema });

export async function markDuplicateAction(input: z.infer<typeof markDuplicateSchema>) {
  const parsed = markDuplicateSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(markDuplicate(parsed.data.reportId, parsed.data.duplicateOfReportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const bulkMarkDuplicateSchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema,
  reportIds: z.array(uuidSchema).min(1, "Select at least one report.").max(50, "Select 50 reports or fewer at a time."),
  duplicateOfReportId: uuidSchema,
});

export type BulkMarkDuplicateResult = { succeededReportIds: string[]; failed: { reportId: string; message: string }[] };

/** Bulk-mark-duplicate only -- the one real, common triage-inbox tedium (several
 * near-identical low-effort reports about the same known issue) named in the product
 * audit, not a generic bulk-action framework. Reuses markDuplicate exactly as
 * markDuplicateAction does, once per selected report -- no new RPC, no new backend bulk
 * primitive. Each report is applied independently and its own outcome recorded, since a
 * legitimate per-report failure (e.g. a report already reached a different terminal
 * status between page load and this submission) must never silently abort the rest of an
 * otherwise-valid batch. */
export async function bulkMarkDuplicateAction(input: z.infer<typeof bulkMarkDuplicateSchema>): Promise<ActionResult<BulkMarkDuplicateResult>> {
  const parsed = bulkMarkDuplicateSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);

  const { organizationId, programId, reportIds, duplicateOfReportId } = parsed.data;
  const succeededReportIds: string[] = [];
  const failed: { reportId: string; message: string }[] = [];

  for (const reportId of reportIds) {
    const result = await toResult(markDuplicate(reportId, duplicateOfReportId));
    if (result.ok) succeededReportIds.push(reportId);
    else failed.push({ reportId, message: result.message });
  }

  if (succeededReportIds.length > 0) {
    revalidatePath(`/organizations/${organizationId}/programs/${programId}/reports`);
    revalidatePath(`/organizations/${organizationId}/programs/${programId}`);
    revalidatePath("/reports");
  }
  return { ok: true, data: { succeededReportIds, failed } };
}

export async function markInformativeAction(input: z.infer<typeof reportActionBase>) {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(markInformative(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

export async function markNotApplicableAction(input: z.infer<typeof reportActionBase>) {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(markNotApplicable(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

export async function rejectReportAction(input: z.infer<typeof reportActionBase>) {
  const parsed = reportActionBase.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(rejectReport(parsed.data.reportId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const resolveSchema = reportActionBase.extend({ resolutionSummary: z.string().trim().min(1, "Describe how this report was resolved.").max(5000, "Use 5000 characters or fewer.") });

export async function resolveReportAction(input: z.infer<typeof resolveSchema>) {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(resolveReport(parsed.data.reportId, parsed.data.resolutionSummary));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const cvssMetricsSchema = z.object({
  attackVector: z.enum(["network", "adjacent", "local", "physical"]),
  attackComplexity: z.enum(["low", "high"]),
  privilegesRequired: z.enum(["none", "low", "high"]),
  userInteraction: z.enum(["none", "required"]),
  scope: z.enum(["unchanged", "changed"]),
  confidentialityImpact: z.enum(["none", "low", "high"]),
  integrityImpact: z.enum(["none", "low", "high"]),
  availabilityImpact: z.enum(["none", "low", "high"]),
});

const severityActionSchema = reportActionBase.extend({ severity: severitySchema, cvss: cvssMetricsSchema.optional() });

export async function setReportCvss4Action(input: { organizationId: string; programId: string; reportId: string; vector: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ organizationId: uuidSchema, programId: uuidSchema, reportId: uuidSchema, vector: z.string().regex(CVSS4_VECTOR_PATTERN, "That isn't a complete CVSS 4.0 base vector.") }).safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const score = cvss4Score(parsed.data.vector);
  if (score === null) return invalidInput("That CVSS 4.0 vector could not be scored.");
  const result = await toResult<null>(setReportCvss4(parsed.data.reportId, parsed.data.vector, score).then(() => null));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

export async function setReportSeverityAction(input: z.infer<typeof severityActionSchema>): Promise<ActionResult<Report>> {
  const parsed = severityActionSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(setReportSeverity(parsed.data.reportId, parsed.data.severity, parsed.data.cvss as CvssMetrics | undefined));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

// --- Communication and evidence (see docs/decisions/0010-report-evidence-and-communication.md) ---

const postResearcherMessageSchema = reportActionBase.extend({ body: z.string().trim().min(1, "Enter a message.").max(5000, "Use 5000 characters or fewer.") });

export async function postResearcherMessageAction(input: z.infer<typeof postResearcherMessageSchema>): Promise<ActionResult<ReportMessage>> {
  const parsed = postResearcherMessageSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(postResearcherMessage(parsed.data.reportId, parsed.data.body));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const postOrganizationMessageSchema = reportActionBase.extend({ body: z.string().trim().min(1, "Enter a message.").max(5000, "Use 5000 characters or fewer."), visibility: visibilitySchema });

export async function postOrganizationMessageAction(input: z.infer<typeof postOrganizationMessageSchema>): Promise<ActionResult<ReportMessage>> {
  const parsed = postOrganizationMessageSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(postOrganizationMessage(parsed.data.reportId, parsed.data.body, parsed.data.visibility));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const addResearcherEvidenceSchema = reportActionBase.extend({ evidenceType: evidenceTypeSchema, content: z.string().trim().min(1, "Enter evidence content.").max(20000, "Use 20000 characters or fewer.") });

export async function addResearcherEvidenceAction(input: z.infer<typeof addResearcherEvidenceSchema>): Promise<ActionResult<ReportEvidence>> {
  const parsed = addResearcherEvidenceSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(addResearcherEvidence(parsed.data.reportId, parsed.data.evidenceType, parsed.data.content));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const addOrganizationEvidenceSchema = reportActionBase.extend({
  evidenceType: evidenceTypeSchema,
  content: z.string().trim().min(1, "Enter evidence content.").max(20000, "Use 20000 characters or fewer."),
  visibility: visibilitySchema,
});

export async function addOrganizationEvidenceAction(input: z.infer<typeof addOrganizationEvidenceSchema>): Promise<ActionResult<ReportEvidence>> {
  const parsed = addOrganizationEvidenceSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(addOrganizationEvidence(parsed.data.reportId, parsed.data.evidenceType, parsed.data.content, parsed.data.visibility));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

// --- Pagination (client-triggered "load more" -- the first page of every list here is
// always server-rendered directly via the service; these two actions exist only so a
// client component can fetch the NEXT page on demand without a full page navigation.
// Authorization is unchanged: RLS/the same service functions decide what comes back,
// exactly as if this were a fresh page load. See docs/decisions/0018 for the underlying
// Page<T>/cursor contract.) ------------------------------------------------------------

const listProgramReportsSchema = z.object({
  programId: uuidSchema,
  cursor: z.string().optional(),
  status: z.enum(["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"]).optional(),
  severity: severitySchema.optional(),
  assignee: z.union([z.literal("me"), z.literal("unassigned"), uuidSchema]).optional(),
});

export async function listReportsForProgramPageAction(input: { programId: string; cursor?: string; status?: ReportStatus; severity?: ReportSeverity; assignee?: string }): Promise<ActionResult<Page<Report>>> {
  const parsed = listProgramReportsSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  return toResult(
    listReportsForProgram(parsed.data.programId, parsed.data.cursor, undefined, { status: parsed.data.status, severity: parsed.data.severity, assignee: parsed.data.assignee }),
  );
}

const listOrganizationReportsSchema = z.object({
  organizationId: uuidSchema,
  cursor: z.string().optional(),
  programId: uuidSchema.optional(),
  status: z.enum(["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"]).optional(),
  severity: severitySchema.optional(),
  assignee: z.union([z.literal("me"), z.literal("unassigned"), uuidSchema]).optional(),
  query: z.string().trim().max(100).optional(),
  sort: z.enum(["newest", "oldest"]).optional(),
});

/** Findings' own "load more" -- see listReportsForProgramPageAction's own comment above,
 * same shape, scoped to an organization instead of one program. */
export async function listReportsForOrganizationPageAction(input: {
  organizationId: string;
  cursor?: string;
  programId?: string;
  status?: ReportStatus;
  severity?: ReportSeverity;
  assignee?: string;
  query?: string;
  sort?: "newest" | "oldest";
}): Promise<ActionResult<Page<Report>>> {
  const parsed = listOrganizationReportsSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  return toResult(
    listReportsForOrganization(parsed.data.organizationId, parsed.data.cursor, undefined, {
      programId: parsed.data.programId,
      status: parsed.data.status,
      severity: parsed.data.severity,
      assignee: parsed.data.assignee,
      query: parsed.data.query,
      sort: parsed.data.sort,
    }),
  );
}

const listMyReportsSchema = z.object({
  cursor: z.string().optional(),
  status: z.enum(["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"]).optional(),
  programId: uuidSchema.optional(),
  severity: severitySchema.optional(),
});

export async function listMyReportsPageAction(input: { cursor?: string; status?: ReportStatus; programId?: string; severity?: ReportSeverity }): Promise<ActionResult<Page<ReportSummary>>> {
  const parsed = listMyReportsSchema.safeParse(input);
  if (!parsed.success) return invalidInput();

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  const { cursor, ...filters } = parsed.data;
  return toResult(listMyReports(user.id, cursor, undefined, filters));
}

// --- Collaboration (see docs/decisions/0064-report-collaboration-scope.md) ---

const addReportCollaboratorSchema = reportActionBase.extend({
  collaboratorUsername: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(32, "Use 32 characters or fewer.")
    // Their account username (letters, numbers, underscores) or a public username (hyphens).
    .regex(/^[A-Za-z0-9_-]{3,32}$/, "Enter their username: letters, numbers, underscores or hyphens."),
  bountySplitPercent: z.coerce.number().gt(0, "Enter a split greater than 0%.").lte(100, "Enter a split of 100% or less."),
});

export async function addReportCollaboratorAction(input: z.infer<typeof addReportCollaboratorSchema>): Promise<ActionResult<ReportCollaborator>> {
  const parsed = addReportCollaboratorSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(addReportCollaborator(parsed.data.reportId, parsed.data.collaboratorUsername, parsed.data.bountySplitPercent));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const removeReportCollaboratorSchema = reportActionBase.extend({ collaboratorId: uuidSchema });

export async function removeReportCollaboratorAction(input: z.infer<typeof removeReportCollaboratorSchema>): Promise<ActionResult<null>> {
  const parsed = removeReportCollaboratorSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(removeReportCollaborator(parsed.data.collaboratorId).then(() => null));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

// --- Retest (see docs/decisions/0075, db/migrations/202609050005_report_retest.sql) ---

const requestReportRetestSchema = reportActionBase.extend({ requesterNotes: z.string().trim().max(2000, "Use 2000 characters or fewer.").optional() });

export async function requestReportRetestAction(input: z.infer<typeof requestReportRetestSchema>): Promise<ActionResult<ReportRetest>> {
  const parsed = requestReportRetestSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(requestReportRetest(parsed.data.reportId, parsed.data.requesterNotes));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const decideReportRetestSchema = reportActionBase.extend({
  retestId: uuidSchema,
  outcome: z.enum(["confirmed_fixed", "still_vulnerable"]),
  decisionNotes: z.string().trim().max(2000, "Use 2000 characters or fewer.").optional(),
});

export async function decideReportRetestAction(input: z.infer<typeof decideReportRetestSchema>): Promise<ActionResult<ReportRetest>> {
  const parsed = decideReportRetestSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(decideReportRetest(parsed.data.retestId, parsed.data.outcome, parsed.data.decisionNotes));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const escalateReportRetestSchema = reportActionBase.extend({ retestId: uuidSchema });

export async function escalateReportRetestAction(input: z.infer<typeof escalateReportRetestSchema>): Promise<ActionResult<ReportRetest>> {
  const parsed = escalateReportRetestSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(escalateReportRetest(parsed.data.retestId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

// --- Mediation (see docs/decisions/0075, db/migrations/202609050006_report_mediation.sql) ---

const mediationReasonSchema = z.enum(["disagree_with_outcome", "disagree_with_severity", "disagree_with_bounty", "unresponsive_communication", "other"]);

const openReportMediationSchema = reportActionBase.extend({
  reason: mediationReasonSchema,
  description: z.string().trim().min(1, "Explain what you are disputing.").max(3000, "Use 3000 characters or fewer."),
});

export async function openReportMediationAction(input: z.infer<typeof openReportMediationSchema>): Promise<ActionResult<ReportMediation>> {
  const parsed = openReportMediationSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(openReportMediation(parsed.data.reportId, parsed.data.reason, parsed.data.description));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const resolveReportMediationSchema = reportActionBase.extend({
  mediationId: uuidSchema,
  outcome: z.enum(["resolved", "declined"]),
  resolutionNotes: z.string().trim().min(1, "Explain the resolution.").max(3000, "Use 3000 characters or fewer."),
});

export async function resolveReportMediationAction(input: z.infer<typeof resolveReportMediationSchema>): Promise<ActionResult<ReportMediation>> {
  const parsed = resolveReportMediationSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message);
  const result = await toResult(resolveReportMediation(parsed.data.mediationId, parsed.data.outcome, parsed.data.resolutionNotes));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const escalateReportMediationSchema = reportActionBase.extend({ mediationId: uuidSchema });

export async function escalateReportMediationAction(input: z.infer<typeof escalateReportMediationSchema>): Promise<ActionResult<ReportMediation>> {
  const parsed = escalateReportMediationSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(escalateReportMediation(parsed.data.mediationId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

const loadEarlierTimelineSchema = reportActionBase.extend({ beforeCreatedAt: z.string().min(1) });

/** The inbox's "load earlier" action for its capped, merged timeline (see
 * services/timeline.ts's own comment on why the cap lives at the merge layer). Never
 * trusts a client-supplied "am I a manager" flag for whether audit/state-change events
 * are included -- independently re-derives the same canTriage check every other
 * manager-only surface in this codebase uses (identical to the /inbox page's own gate and
 * the report detail page's own canTriage derivation), since audit_logs rows are
 * manager-only data (see getReportAuditActivity's own comment). A plain researcher (or
 * anyone else this check rejects) gets an AUTH_REQUIRED-shaped rejection here, never a
 * silently-narrowed timeline -- this action is only ever invoked from the inbox UI, which
 * is itself already manager-gated at the page level, but the action layer never trusts
 * that alone. */
export async function loadEarlierReportTimelineAction(input: z.infer<typeof loadEarlierTimelineSchema>): Promise<ActionResult<ReportTimelinePage>> {
  const parsed = loadEarlierTimelineSchema.safeParse(input);
  if (!parsed.success) return invalidInput();

  const user = await getCurrentUser();
  if (!user) return { ok: false as const, code: "AUTH_REQUIRED", message: "Your session has expired. Sign in again to continue." };

  const report = await getReport(parsed.data.reportId);
  if (!report || report.organizationId !== parsed.data.organizationId || report.programId !== parsed.data.programId) {
    return { ok: false as const, code: "NOT_FOUND", message: "This report does not exist, or you do not have access to it." };
  }

  const [members, actorMembership] = await Promise.all([listProgramMembers(parsed.data.programId), getActorMembership(user.id, parsed.data.organizationId)]);
  const isProgramManager = members.some((member) => member.userId === user.id);
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  if (!isProgramManager && !isOrgAdmin) {
    return { ok: false as const, code: "FORBIDDEN", message: "Only a program manager or organization admin can view this timeline." };
  }

  return toResult(getReportTimeline(parsed.data.reportId, true, parsed.data.beforeCreatedAt));
}

const assignSchema = reportActionBase.extend({ assigneeId: uuidSchema.nullable() });

/** assign_report re-checks the caller may triage this report and the assignee is eligible. */
export async function assignReportAction(input: z.infer<typeof assignSchema>): Promise<ActionResult<void>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const result = await toResult(assignReport(parsed.data.reportId, parsed.data.assigneeId));
  if (result.ok) revalidateReportPaths(parsed.data.organizationId, parsed.data.programId, parsed.data.reportId);
  return result;
}

// Server-side report drafts (202610060014): typed text only, never attachments.
const draftSchema = z.object({
  programId: uuidSchema,
  draft: z.object({
    assetType: assetTypeSchema,
    target: z.string().max(2048),
    title: z.string().max(200),
    weaknessType: z.union([weaknessTypeSchema, z.literal("")]),
    description: z.string().max(20000),
    impact: z.string().max(20000),
    researcherSeverity: z.union([severitySchema, z.literal("")]),
    stagedEvidence: z.array(z.object({ localId: z.string().max(64), evidenceType: evidenceTypeSchema, content: z.string().max(20000) })).max(20),
  }),
});

export async function saveReportDraftAction(input: z.infer<typeof draftSchema>): Promise<ActionResult<string>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return invalidInput("This draft could not be saved.");
  return toResult(saveMyReportDraft(parsed.data.programId, parsed.data.draft));
}

export async function deleteReportDraftAction(input: { programId: string }): Promise<ActionResult<void>> {
  const parsed = z.object({ programId: uuidSchema }).safeParse(input);
  if (!parsed.success) return invalidInput();
  return toResult(deleteMyReportDraft(parsed.data.programId));
}
