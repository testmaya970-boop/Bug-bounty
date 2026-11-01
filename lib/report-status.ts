import type { ReportSeverity, ReportStatus, ReportSummary } from "@/types/report";

// Pure presentation logic, deliberately not in services/reports.ts (which is
// server-only) -- both server pages and client-rendered components need it, the same
// reason lib/program-status.ts exists separately from services/programs.ts.
//
// The transition map below is a UI HINT ONLY, mirroring DOMAIN.md's table for the
// purpose of deciding which action buttons to render -- it is not the authorization
// boundary. private.report_status_transitions (supabase/migrations/202608270002) is the
// actual, authoritative, server-enforced source of truth; every action re-validates
// there regardless of what this map shows. See docs/decisions/0009-report-triage-state-machine.md.

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  new: "New",
  triaging: "Triaging",
  needs_information: "Needs information",
  accepted: "Accepted",
  resolved: "Resolved",
  duplicate: "Duplicate",
  informative: "Informative",
  not_applicable: "Not applicable",
  rejected: "Rejected",
};

export function reportStatusLabel(status: ReportStatus): string {
  return REPORT_STATUS_LABELS[status];
}

const REPORT_STATUS_MEANINGS: Record<ReportStatus, string> = {
  new: "Awaiting initial triage.",
  triaging: "An authorized program team member is reviewing this report.",
  needs_information: "The program has asked the researcher for more information before continuing.",
  accepted: "The program has confirmed this is a valid finding and is working toward a resolution.",
  resolved: "The program has confirmed this finding was addressed.",
  duplicate: "This report describes the same issue as another report already on file.",
  informative: "The program reviewed this report but it does not represent an actionable finding.",
  not_applicable: "The program determined this report does not apply to an in-scope target or condition.",
  rejected: "The program declined this report.",
};

export function reportStatusMeaning(status: ReportStatus): string {
  return REPORT_STATUS_MEANINGS[status];
}

export const REPORT_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  new: ["triaging", "needs_information", "accepted", "duplicate", "informative", "not_applicable", "rejected"],
  triaging: ["needs_information", "accepted", "duplicate", "informative", "not_applicable", "rejected"],
  needs_information: ["triaging", "accepted", "duplicate", "informative", "not_applicable", "rejected"],
  accepted: ["resolved", "needs_information"],
  resolved: [],
  duplicate: [],
  informative: [],
  not_applicable: [],
  rejected: [],
};

/** A short, honest "what does a triager still need to do" hint for one inbox row --
 * derived purely from REPORT_STATUS_TRANSITIONS above (the status changes a triager can pick;
 * a resolved report reopens only when a retest fails, via decide_report_retest, not a status pick). Every terminal status reads "None (final)",
 * matching this page's own isFinal = allowedNext.length === 0 predicate. */
export function reportNextActionLabel(status: ReportStatus): string {
  if (REPORT_STATUS_TRANSITIONS[status].length === 0) return "None (final)";
  switch (status) {
    case "new":
      return "Start triage";
    case "triaging":
      return "Decide outcome";
    case "needs_information":
      return "Awaiting researcher";
    case "accepted":
      return "Resolve";
    default:
      return "Review";
  }
}

/** The identical status, from the submitting researcher's own point of view -- never the
 * manager-phrased hint above ("Start triage" said to a researcher who cannot triage would
 * be actively misleading). A terminal status has no action, matching isFinal. */
export function researcherNextActionLabel(status: ReportStatus): string {
  if (REPORT_STATUS_TRANSITIONS[status].length === 0) return "None (final)";
  if (status === "needs_information") return "Respond with the requested information";
  return "Awaiting the organization";
}

// Canonical lifecycle order, matching REPORT_STATUS_TRANSITIONS/types/report.ts's own
// union order -- used by the Reports page's own status filter, not a separately-invented
// ordering.
export const REPORT_STATUS_ORDER: ReportStatus[] = ["new", "triaging", "needs_information", "accepted", "resolved", "duplicate", "informative", "not_applicable", "rejected"];
export const REPORT_SEVERITY_ORDER: ReportSeverity[] = ["critical", "high", "medium", "low", "none"];

/** The one place a severity gets its display label. The stored value `none` means an
 * informational finding, so it reads "Info" everywhere; the enum value itself is unchanged,
 * so no stored report, bounty table, or API value moves. */
export const SEVERITY_LABEL: Record<ReportSeverity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", none: "Info" };
export function severityLabel(severity: ReportSeverity): string {
  return SEVERITY_LABEL[severity];
}
const SEVERITY_RANK: Record<ReportSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

export type ReportSortOption = "newest" | "oldest" | "severity";
export type ReportFilters = { status?: ReportStatus; programId?: string; severity?: ReportSeverity; sort: ReportSortOption };

/** Applies the researcher Reports page's own status/program/severity/sort filter --
 * shared between the page (server-rendered first page) and MyReportsList (a "Load more"
 * page fetched client-side), since list_my_reports has no filter parameter itself
 * (docs/decisions/0018): a filter narrows only the reports actually fetched so far,
 * never a fabricated total. */
export function applyReportFilters(reports: ReportSummary[], filters: ReportFilters): ReportSummary[] {
  const filtered = reports.filter((report) => {
    if (filters.status && report.status !== filters.status) return false;
    if (filters.programId && report.programId !== filters.programId) return false;
    if (filters.severity && report.confirmedSeverity !== filters.severity) return false;
    return true;
  });
  const sorted = [...filtered];
  if (filters.sort === "oldest") {
    sorted.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  } else if (filters.sort === "severity") {
    sorted.sort((a, b) => SEVERITY_RANK[a.confirmedSeverity ?? "none"] - SEVERITY_RANK[b.confirmedSeverity ?? "none"]);
  } else {
    sorted.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }
  return sorted;
}
