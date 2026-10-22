import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../../components/ui/navigation";
import { Alert, Card, PermissionDenied } from "../../../../../../../components/ui/feedback";
import { AssetTypeBadge, SeverityBadge, StatusBadge } from "../../../../../../../components/ui/badge";
import { SeverityControl, TriageActionPanel } from "../../../../../../../components/reports/triage-actions";
import { ReportAssigneeControl } from "../../../../../../../components/reports/report-assignee";
import { ReportStatusHistory } from "../../../../../../../components/reports/report-status-history";
import { LiveSeverityBadge, LiveStatusBadge, LiveStatusMeaning, TriageStatusRailProvider } from "../../../../../../../components/reports/triage-status-rail";
import { ReportActivity } from "../../../../../../../components/reports/report-activity";
import { OrganizationMessageComposer, ReportCommunication, ResearcherMessageComposer } from "../../../../../../../components/reports/report-communication";
import {
  OrganizationEvidenceComposer,
  OrganizationFileEvidenceComposer,
  ReportEvidenceSection,
  ResearcherEvidenceComposer,
  ResearcherFileEvidenceComposer,
} from "../../../../../../../components/reports/report-evidence";
import { BountyDecisionSection } from "../../../../../../../components/reports/bounty-decision";
import { PaymentStatusSection } from "../../../../../../../components/reports/payment-status";
import { OrganizationDisclosureDecisionPanel, ResearcherDisclosurePanel } from "../../../../../../../components/reports/report-disclosure";
import { CvssSummary } from "../../../../../../../components/reports/cvss-summary";
import { Cvss4Editor } from "../../../../../../../components/reports/cvss4-editor";
import { ReportCollaboratorsPanel } from "../../../../../../../components/reports/report-collaborators";
import { ReportRetestPanel } from "../../../../../../../components/reports/report-retest";
import { ReportMediationPanel } from "../../../../../../../components/reports/report-mediation";
import { SectionLabel, MetadataPair } from "../../../../../../../components/ui/security-primitives";
import { Markdown } from "../../../../../../../components/ui/markdown";
import { getReport, getReportStatusHistory, listAssignableStaff, getReportAuditActivity, listReportCollaborators, listReportEvidence, listReportMediations, listReportMessages, listReportRetests } from "../../../../../../../services/reports";
import { getBountyAcceptance, getReportBountyDecision } from "../../../../../../../services/bounty";
import { getReportJiraLink } from "../../../../../../../services/jira";
import { getReportSla } from "../../../../../../../services/program-policy";
import { ReportSlaPanel } from "../../../../../../../components/programs/program-policy";
import { getReportDisclosure } from "../../../../../../../services/report-disclosures";
import { getReportPayoutReadiness, listPaymentAttempts, listReportPaymentObligations } from "../../../../../../../services/payments";
import { canCreateProgram } from "../../../../../../../services/authorization";
import { getActorMembership } from "../../../../../../../services/organization-members";
import { getProgram, listProgramMembers } from "../../../../../../../services/programs";
import { getCurrentUser } from "../../../../../../../lib/auth/current-user";
import { reportStatusMeaning, reportNextActionLabel, researcherNextActionLabel, REPORT_STATUS_TRANSITIONS } from "../../../../../../../lib/report-status";
import { weaknessTypeLabel } from "../../../../../../../lib/report-weakness-labels";
import { getResearcherBiography } from "../../../../../../../services/researcher-profiles";
import { LocalTime } from "../../../../../../../components/ui/local-time";

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; programId: string; reportId: string }>;
  searchParams: Promise<{ evidenceIssues?: string }>;
}) {
  const { organizationId, programId, reportId } = await params;
  const { evidenceIssues } = await searchParams;
  // Set only by CreateReportForm immediately after a successful submission, when one or
  // more staged evidence items/attachments failed to attach (a rare, transient failure
  // between two real network calls -- the report itself was created successfully
  // regardless). Never silently dropped: this is a one-time, honest count pointing at the
  // same composers below, which already support adding evidence to an existing report.
  const evidenceIssueCount = evidenceIssues ? Number.parseInt(evidenceIssues, 10) : 0;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/reports/${reportId}` as Route);

  const report = await getReport(reportId);

  // A null result covers "does not exist" and "exists but you have no access"
  // identically -- RLS already made that decision (the submitting researcher, an org
  // owner/security admin, or a program manager; never another researcher, never a
  // non-manager org member). A report id resolving under a different program/org in the
  // URL is treated the same way, rather than silently rendering it under the wrong context.
  if (!report || report.organizationId !== organizationId || report.programId !== programId) {
    return (
      <AppShell title="Report" user={user} organizationId={organizationId}>
        <PermissionDenied>This report does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  const isOwnReport = report.researcherId === user.id;

  // Same predicate the program control-center page and the database's
  // private.lock_and_authorize_report_for_triage use -- the existing centralized
  // capability model, not a new page-local check. See docs/decisions/0009.
  const [members, actorMembership, program] = await Promise.all([listProgramMembers(programId), getActorMembership(user.id, organizationId), getProgram(programId)]);
  // program_members (202609250012): "manager" runs the program; any assignment, including
  // "triager", works its reports. The database enforces the same split.
  const isProgramManager = members.some((member) => member.userId === user.id && member.role === "manager");
  const isProgramTriager = members.some((member) => member.userId === user.id);
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  const canTriage = isProgramTriager || isOrgAdmin;

  // Committing a financial figure is more sensitive than triage: org admins and the
  // program's own manager, never a triager (lock_and_authorize_report_for_finance).
  const canFinalizeBounty = isOrgAdmin || isProgramManager;
  // Payouts and platform fees: org admins here; billing admins use the Payments page
  // (they can't open report contents). Never program managers or triagers.
  const canManagePaymentsHere = isOrgAdmin;

  const [auditEvents, messages, evidence, bountyDecision, paymentObligations, researcherBiography, disclosure, collaborators, retests, mediations, sla, assignableStaff, statusHistory, jiraLink] = await Promise.all([
    canTriage ? getReportAuditActivity(reportId) : Promise.resolve([]),
    listReportMessages(reportId),
    listReportEvidence(reportId),
    getReportBountyDecision(reportId),
    listReportPaymentObligations(reportId),
    getResearcherBiography(report.researcherId),
    getReportDisclosure(reportId),
    listReportCollaborators(reportId),
    listReportRetests(reportId),
    listReportMediations(reportId),
    isOwnReport || canTriage ? getReportSla(reportId) : Promise.resolve(null),
    canTriage ? listAssignableStaff(organizationId, programId) : Promise.resolve([]),
    // The researcher's own timeline; staff get the full audit trail below instead.
    !canTriage ? getReportStatusHistory(reportId) : Promise.resolve([]),
    // The org's internal tracker: triage staff only, never the researcher (the RPC applies
    // the same predicate and returns nothing otherwise).
    canTriage ? getReportJiraLink(reportId) : Promise.resolve(null),
  ]);
  // Attempt-level detail (failure code/message, provider reference) is manager-only and
  // only needed while a payout is actually in flight -- fetched after the obligations are
  // known, rather than speculatively for every report.
  const inFlight = isOrgAdmin ? paymentObligations.filter((o) => o.status === "processing") : [];
  const latestPaymentAttempts: Record<string, Awaited<ReturnType<typeof listPaymentAttempts>>[number]> = Object.fromEntries(
    (await Promise.all(inFlight.map(async (o) => [o.id, (await listPaymentAttempts(o.id))[0]] as const))).filter(([, attempt]) => attempt !== undefined),
  );
  // Only for a finalized bounty, and only for who may see it: finance roles get every
  // recipient's blockers, a researcher only their own (get_report_payout_readiness).
  const bountyFinalized = bountyDecision?.state === "finalized";
  const [payoutReadiness, bountyAcceptance] =
    bountyFinalized && (isOwnReport || canTriage) ? await Promise.all([getReportPayoutReadiness(reportId), getBountyAcceptance(reportId)]) : [[], null];
  // Staff see which report this duplicates; the researcher can't open someone else's report.
  const duplicateOriginal = report.status === "duplicate" && report.duplicateOfReportId && canTriage ? await getReport(report.duplicateOfReportId).catch(() => null) : null;
  const actorNames: Record<string, string> = { [report.researcherId]: report.researcherName, [user.id]: user.displayName };
  members.forEach((member) => {
    actorNames[member.userId] = member.displayName;
  });

  const allowedNext = REPORT_STATUS_TRANSITIONS[report.status];
  // A report with no legal outgoing transition has reached the organization's final
  // decision (docs/decisions/0012) -- the same predicate the database itself uses to
  // decide whether confirmed_severity can still change.
  const isFinal = allowedNext.length === 0;

  return (
    <AppShell title={report.title} user={user} organizationId={organizationId}>
      <TriageStatusRailProvider initialStatus={report.status} initialSeverity={report.confirmedSeverity}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Breadcrumbs
          items={[
            // Staff get the org trail; the researcher who wrote it goes back via Programs.
            ...(actorMembership?.status === "active"
              ? [
                  { label: "Organizations", href: "/organizations" },
                  { label: "Engagements", href: `/organizations/${organizationId}/programs` },
                ]
              : [{ label: "Programs", href: "/programs" }]),
            { label: program?.name ?? "Program", href: `/organizations/${organizationId}/programs/${programId}` },
            { label: report.title },
          ]}
        />

        {evidenceIssueCount > 0 && isOwnReport && (
          <Alert tone="warning" title="Your report was submitted.">
            {evidenceIssueCount === 1 ? "One item" : `${evidenceIssueCount} items`} you added didn&apos;t attach. Add {evidenceIssueCount === 1 ? "it" : "them"} again below, in Evidence.
          </Alert>
        )}

        {/* The single most prominent signal on this page, for the researcher's own view:
            not a manager (who has their own Triage rail), and not merely a MetadataPair
            buried in the sidebar — a real, actionable banner derived from the same
            researcherNextActionLabel/REPORT_STATUS_TRANSITIONS this page's sidebar
            already uses, never a second, competing status computation. */}
        {isOwnReport && !canTriage && (
          <Alert
            className="motion-safe:animate-enter-rise"
            tone={report.status === "needs_information" ? "warning" : isFinal ? "success" : "info"}
            title={report.status === "needs_information" ? "Action required" : isFinal ? "Resolved, no further action needed" : "Waiting on the organization"}
          >
            {report.status === "needs_information" ? (
              <>The organization has requested more information. Respond below, in Communication.</>
            ) : isFinal ? (
              <>This report is closed. Its history stays here for your records.</>
            ) : (
              <>Nothing for you to do right now. You&apos;ll get a notification when the organization updates this report.</>
            )}
          </Alert>
        )}

        {/* The case header — target is the single most important fact on this screen, a
            security analyst scanning this page must find it in the first second, not
            buried inside a metadata grid. A heavier bordered strip (2px, not the ordinary
            1px card border) gives this bar more visual weight than an ordinary card --
            deliberately not a dark inversion, since StatusBadge/SeverityBadge's semantic
            colors are tuned for a light surface and would lose contrast on bg-ink (see
            docs/decisions/0043). */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-ink bg-surface px-4 py-3.5 sm:px-5">
          <AssetTypeBadge assetType={report.assetType} />
          <span className="break-all font-mono text-sm font-medium text-ink">{report.displayTarget}</span>
          <span className="text-ink-muted">·</span>
          {canTriage ? (
            <>
              <LiveStatusBadge />
              <LiveSeverityBadge />
            </>
          ) : (
            <>
              <StatusBadge status={report.status} />
              {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
            </>
          )}
        </div>

        {/* Main column: what the researcher submitted, then the supporting record built on
            top of it (communication, evidence, history) — reading order matches how a
            triager actually works through a report. The organization's own decision lives
            in the contextual rail to the right, never mixed into this column, so the two
            are never mistaken for one continuous narrative. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
          <div className="space-y-6">
            {/* The researcher's original claim, presented as a document header rather than
                a boxed card — nothing here is ever rewritten by triage (submitted_at,
                target, scope match, and text are exactly what was submitted). See
                docs/decisions/0009-report-triage-state-machine.md and 0043. */}
            <div className="border-b-2 border-border pb-6">
              <SectionLabel>Submitted by researcher</SectionLabel>
              <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <MetadataPair label="Researcher" value={isOwnReport ? "You" : report.researcherName} />
                <MetadataPair label="Submitted" value=<LocalTime value={report.submittedAt} /> />
                {/* weaknessType/researcherSeverity are null for a report submitted before
                    docs/decisions/0047 — degrade to "Not specified" rather than hiding
                    the field entirely, so the layout doesn't shift between old and new
                    reports. researcherSeverity is deliberately labeled distinctly from
                    the decision rail's "Confirmed severity" — see that field's own
                    comment for why this is advisory-only, never authoritative. */}
                <MetadataPair label="Weakness type" value={report.weaknessType ? weaknessTypeLabel(report.weaknessType) : "Not specified"} />
                <MetadataPair label="Researcher's severity assessment" value={report.researcherSeverity ? report.researcherSeverity[0].toUpperCase() + report.researcherSeverity.slice(1) : "Not set"} />
                <MetadataPair
                  label="Scope authorization"
                  className="sm:col-span-2"
                  value={
                    <>
                      Matched <span className="break-all font-mono">{report.matchedTarget}</span> (in scope) at submission time
                    </>
                  }
                />
              </div>
              {/* A real credibility signal for an organization triaging this report --
                  who is this researcher — using the researcher's own real, self-written
                  bio (see docs/decisions/0049). Never shown when absent: no placeholder
                  "This researcher hasn't written a bio yet," which would be noise on
                  every report from every researcher who has not opted in. */}
              {researcherBiography && (
                <div className="mt-5 border-t border-border pt-5">
                  <SectionLabel>About {isOwnReport ? "you" : report.researcherName}</SectionLabel>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-muted">{researcherBiography}</p>
                </div>
              )}
              <div className="mt-5 border-t border-border pt-5">
                <SectionLabel>Reproduction</SectionLabel>
                <Markdown content={report.description} className="mt-2" />
              </div>
              {report.impact && (
                <div className="mt-5 border-t border-border pt-5">
                  <SectionLabel>Impact</SectionLabel>
                  <Markdown content={report.impact} className="mt-2" />
                </div>
              )}
              {report.cvssMetrics && report.cvssBaseScore !== null && <CvssSummary metrics={report.cvssMetrics} baseScore={report.cvssBaseScore} confirmedSeverity={report.confirmedSeverity} />}
            </div>

            {/* Collaborators: visible to the submitter, any listed collaborator, and
                program staff -- RLS on report_collaborators already gates who can reach
                this data at all, so rendering here whenever the list is non-empty or the
                submitter could add to it is never overexposing anything. Only the
                submitter gets the manage actions (add/remove) -- a collaborator sees the
                same list read-only. See docs/decisions/0064-report-collaboration-scope.md. */}
            {(isOwnReport || canTriage || collaborators.length > 0) && (
              <Card className="p-5 sm:p-6">
                <ReportCollaboratorsPanel
                  organizationId={organizationId}
                  programId={programId}
                  reportId={reportId}
                  collaborators={collaborators}
                  submitterName={isOwnReport ? "You" : report.researcherName}
                  canManage={isOwnReport}
                  locked={report.status !== "new" && report.status !== "triaging"}
                />
              </Card>
            )}

            {/* Communication is supporting data, never an edit to the researcher's claim or
                the organization's decision — its own card, its own visibility rules. See
                docs/decisions/0010-report-evidence-and-communication.md. */}
            <Card className="p-5 sm:p-6">
              <SectionLabel>Communication</SectionLabel>
              <div className="mt-3">
                <ReportCommunication messages={messages} showInternal={canTriage} />
              </div>
              {isOwnReport && (
                <div className="mt-5 border-t border-border pt-5">
                  <ResearcherMessageComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                </div>
              )}
              {canTriage && (
                <div className="mt-5 border-t border-border pt-5">
                  <OrganizationMessageComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                </div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <SectionLabel>Evidence</SectionLabel>
              <div className="mt-3">
                <ReportEvidenceSection evidence={evidence} showInternal={canTriage} organizationId={organizationId} programId={programId} reportId={reportId} />
              </div>
              {isOwnReport && (
                <div className="mt-5 space-y-5 border-t border-border pt-5">
                  <ResearcherEvidenceComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                  <ResearcherFileEvidenceComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                </div>
              )}
              {canTriage && (
                <div className="mt-5 space-y-5 border-t border-border pt-5">
                  <OrganizationEvidenceComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                  <OrganizationFileEvidenceComposer organizationId={organizationId} programId={programId} reportId={reportId} />
                </div>
              )}
            </Card>

            {!canTriage && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>History</SectionLabel>
                <div className="mt-3">
                  <ReportStatusHistory events={statusHistory} />
                </div>
              </Card>
            )}

            {canTriage && auditEvents.length > 0 && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Decision history</SectionLabel>
                <div className="mt-3">
                  <ReportActivity events={auditEvents} actorNames={actorNames} />
                </div>
              </Card>
            )}
          </div>

          {/* Contextual rail: the organization's decision and its financial consequences --
              deliberately a separate column, not a separate card in the same reading flow,
              so "what was submitted" and "what was decided" are never visually continuous.
              Sticky on desktop so the current status/action stays visible while reading a
              long communication or evidence history. */}
          <div className="mt-6 space-y-6 lg:sticky lg:top-24 lg:mt-0">
            {/* Once the report has no legal outgoing transition, this becomes the
                organization's FINAL decision — the eyebrow label and severity control both
                reflect that. See docs/decisions/0012-report-resolution-and-classification.md. */}
            <Card className="border-l-4 border-l-action p-5 sm:p-6">
              <SectionLabel>{isFinal ? "Final decision" : "Triage"}</SectionLabel>
              {canTriage ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <LiveStatusBadge />
                    <LiveSeverityBadge />
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">
                    <LiveStatusMeaning />
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={report.status} />
                    {report.confirmedSeverity && <SeverityBadge severity={report.confirmedSeverity} />}
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">{reportStatusMeaning(report.status)}</p>
                </>
              )}
              {isFinal && <p className="mt-1 text-sm text-ink-muted">This is the organization's final decision on this report. It cannot be changed to a different status.</p>}

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                {program && <MetadataPair label="Program" value={program.name} />}
                {!isFinal && <MetadataPair label="Next action" value={canTriage ? reportNextActionLabel(report.status) : researcherNextActionLabel(report.status)} />}
                {jiraLink && (
                  <MetadataPair
                    label="Jira issue"
                    value={
                      <a
                        href={jiraLink.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        View in Jira: {jiraLink.issueKey} →
                      </a>
                    }
                  />
                )}
              </div>

              {report.resolutionSummary && (
                <div className="mt-3 rounded-md border border-border p-3">
                  <SectionLabel>Resolution</SectionLabel>
                  <Markdown content={report.resolutionSummary} className="mt-1" />
                </div>
              )}
              {report.status === "duplicate" && report.duplicateOfReportId && (
                <p className="mt-3 text-sm text-ink-muted">
                  {duplicateOriginal ? (
                    <>
                      Duplicate of{" "}
                      <a href={`/organizations/${organizationId}/programs/${programId}/reports/${duplicateOriginal.id}` as Route} className="font-medium text-action underline underline-offset-2">
                        {duplicateOriginal.title}
                      </a>
                    </>
                  ) : (
                    "Duplicate of an earlier report on this program."
                  )}
                </p>
              )}

              {canTriage && (
                <div className="mt-5 space-y-4 border-t border-border pt-5">
                  <ReportAssigneeControl organizationId={organizationId} programId={programId} reportId={reportId} assigneeId={report.assigneeId} staff={assignableStaff} currentUserId={user.id} />
                  <SeverityControl organizationId={organizationId} programId={programId} reportId={reportId} currentSeverity={report.confirmedSeverity} currentCvssBaseScore={report.cvssBaseScore} locked={isFinal || bountyFinalized} lockReason={bountyFinalized && !isFinal ? "bounty" : "decision"} />
                  <Cvss4Editor organizationId={organizationId} programId={programId} reportId={reportId} vector={report.cvss4Vector ?? null} score={report.cvss4Score ?? null} locked={isFinal || bountyFinalized} />
                  <TriageActionPanel organizationId={organizationId} programId={programId} reportId={reportId} status={report.status} allowedNext={allowedNext} />
                </div>
              )}
              {/* isFinal/allowedNext above are still the server-derived values (this
                  page only re-renders them for real once router.refresh() lands) --
                  the provider only makes the two badges + meaning sentence above
                  optimistic, deliberately not these gating booleans, so a triager can
                  never click a transition the real status no longer allows. */}

              {/* On the researcher's own read-only view (no SeverityControl/
                  TriageActionPanel above), this rail would otherwise be a single short
                  card next to a much taller submission column. Submitted/updated are
                  real fields already loaded for this report -- not filler -- and give
                  the researcher a genuine at-a-glance timeline regardless of report
                  length. */}
              {!canTriage && (
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <MetadataPair label="Submitted" value=<LocalTime value={report.submittedAt} /> />
                  <MetadataPair label="Last updated" value=<LocalTime value={report.updatedAt} /> />
                </div>
              )}
            </Card>

            {/* Bounty is a separate decision layered on top of the final report decision --
                never a property of the report row itself. See
                docs/decisions/0013-bounty-decision-engine.md. */}
            {sla && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Response targets</SectionLabel>
                <div className="mt-3">
                  <ReportSlaPanel sla={sla} />
                </div>
              </Card>
            )}

            {(isOwnReport || canTriage) && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Bounty</SectionLabel>
                <div className="mt-3">
                  <BountyDecisionSection decision={bountyDecision} canCalculate={canTriage} reportIsFinal={isFinal} canFinalize={canFinalizeBounty} organizationId={organizationId} programId={programId} reportId={reportId} />
                </div>
              </Card>
            )}

            {/* A finalized bounty decision is not a payment — separate card, separate data,
                separate authorization. Renders only once there is something real to say
                about payment. See docs/decisions/0014-payment-ledger-and-payout-orchestration.md. */}
            {(isOwnReport || canTriage) && bountyDecision?.state === "finalized" && bountyDecision.currency && bountyDecision.finalAmountMinorUnits !== null && (
              <Card className="p-5 sm:p-6">
                <SectionLabel>Payment</SectionLabel>
                <div className="mt-3">
                  <PaymentStatusSection
                    obligations={paymentObligations}
                    latestAttempts={latestPaymentAttempts}
                    readiness={payoutReadiness}
                    acceptance={bountyAcceptance}
                    isOwnReport={isOwnReport}
                    canManage={canManagePaymentsHere}
                    bountyCurrency={bountyDecision.currency}
                    bountyAmountMinorUnits={bountyDecision.finalAmountMinorUnits}
                    organizationId={organizationId}
                    programId={programId}
                    reportId={reportId}
                  />
                </div>
              </Card>
            )}

            {/* Disclosure is only offered once the organization has reached a final
                decision -- matches private.get_terminal_report_for_disclosure's own gate
                (request_report_disclosure rejects on a non-terminal report). Researcher
                sees the request/status panel; an org manager sees the decision panel only
                once a request actually exists. See
                supabase/migrations/202609030001_report_disclosure_workflow.sql. */}
            {isOwnReport && (report.status === "resolved" || disclosure) && (
              <Card className="p-5 sm:p-6">
                <ResearcherDisclosurePanel reportId={reportId} reportTitle={report.title} initialDisclosure={disclosure} />
              </Card>
            )}
            {canTriage && disclosure && (
              <Card className="p-5 sm:p-6">
                <OrganizationDisclosureDecisionPanel reportId={reportId} disclosure={disclosure} canDecide={canFinalizeBounty} />
              </Card>
            )}

            {/* Retest: real, narrowly-scoped, never reopens the report's own status --
                only ever offered once the report is specifically 'resolved' (a fix was
                actually claimed), matching request_report_retest's own server-side gate.
                See docs/decisions/0075, supabase/migrations/202609050005_report_retest.sql. */}
            {report.status === "resolved" && (isOwnReport || canTriage) && (
              <Card className="p-5 sm:p-6">
                <ReportRetestPanel organizationId={organizationId} programId={programId} reportId={reportId} retests={retests} canRequest={isOwnReport} canDecide={canTriage} canEscalate={isOwnReport} />
              </Card>
            )}

            {/* Mediation: a researcher-initiated dispute over any terminal outcome --
                resolved by the organization's own owner/security_admin, since no
                platform-level adjudicator exists yet. See docs/decisions/0075,
                supabase/migrations/202609050006_report_mediation.sql. */}
            {isFinal && (isOwnReport || canTriage) && (
              <Card className="p-5 sm:p-6">
                <ReportMediationPanel organizationId={organizationId} programId={programId} reportId={reportId} mediations={mediations} canOpen={isOwnReport} canResolve={canTriage} />
              </Card>
            )}
          </div>
        </div>
      </div>
      </TriageStatusRailProvider>
    </AppShell>
  );
}
