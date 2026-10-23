import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../../../../components/ui/feedback";
import { Alert } from "../../../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../../../components/ui/security-primitives";
import { CreateReportForm } from "../../../../../../../components/reports/create-report-form";
import { getProgram } from "../../../../../../../services/programs";
import { getMyParticipation } from "../../../../../../../services/program-researchers";
import { listActiveScopeEntries } from "../../../../../../../services/scope";
import { getProgramPolicy } from "../../../../../../../services/program-policy";
import { getMyReportDraft } from "../../../../../../../services/reports";
import { listMyReportTemplates } from "../../../../../../../services/report-templates";
import { getMySubmissionStanding, isMyIdentityVerified } from "../../../../../../../services/submission-signal";
import Link from "next/link";
import { SubmissionStandingPanel } from "../../../../../../../components/reports/submission-standing";
import { captchaConfig } from "../../../../../../../lib/integrations/captcha";
import type { DraftFields } from "../../../../../../../components/reports/create-report-form";
import { getCurrentUser } from "../../../../../../../lib/auth/current-user";

export default async function NewReportPage({ params }: { params: Promise<{ organizationId: string; programId: string }> }) {
  const { organizationId, programId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/reports/new` as Route);

  const program = await getProgram(programId);
  if (!program || program.organizationId !== organizationId) {
    return (
      <AppShell title="Report a vulnerability" user={user} organizationId={organizationId}>
        <PermissionDenied>This program does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  const participation = await getMyParticipation(user.id, programId);
  if (!participation || participation.status !== "active") {
    return (
      <AppShell title="Report a vulnerability" user={user} organizationId={organizationId}>
        <PermissionDenied>You are not currently an authorized, active researcher for this program.</PermissionDenied>
      </AppShell>
    );
  }

  if (program.status === "paused" || program.status === "closed") {
    return (
      <AppShell title="Report a vulnerability" user={user} organizationId={organizationId}>
        <EmptyState title="This program is not currently accepting reports">Its status is {program.status}. Check back later, or contact the program if you believe this is a mistake.</EmptyState>
      </AppShell>
    );
  }

  // Identity first (202610230008): the database refuses a report from an unverified researcher,
  // so say so before they write one.
  if (!(await isMyIdentityVerified())) {
    return (
      <AppShell title="Report a vulnerability" user={user} organizationId={organizationId}>
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold text-ink">Verify your identity to submit reports</h2>
          <p className="mt-2 text-sm text-ink-muted">Every researcher on Unpatched verifies their identity once, with a PAN, Aadhaar or passport. It keeps programs safe from fake accounts and lets you get paid.</p>
          <Link prefetch={false} href={"/settings/identity" as Route} className="mt-4 inline-flex h-9 items-center rounded-md bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
            Verify identity
          </Link>
        </div>
      </AppShell>
    );
  }

  // Real in-scope targets, suggested (not enforced -- the server RPC still makes the final
  // scope decision, per this page's own existing copy above the Target field) so a
  // researcher can pick a published target instead of retyping it from memory and risking
  // a typo. The same pattern HackerOne/Bugcrowd's own report forms use.
  const [scopeEntries, policy, savedDraft, savedTemplates, standing] = await Promise.all([
    listActiveScopeEntries(programId),
    getProgramPolicy(programId),
    getMyReportDraft(programId),
    listMyReportTemplates(),
    getMySubmissionStanding(),
  ]);
  const initialDraft = savedDraft ? ({ ...savedDraft.draft, savedAt: savedDraft.updatedAt } as DraftFields) : null;
  const inScopeTargets = scopeEntries.filter((entry) => entry.scopeState === "in_scope");

  return (
    <AppShell title="Report a vulnerability" user={user} organizationId={organizationId}>
      <div className="mx-auto max-w-2xl space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: "Engagements", href: `/organizations/${organizationId}/programs` },
            { label: program.name, href: `/organizations/${organizationId}/programs/${programId}` },
            { label: "Report a vulnerability" },
          ]}
        />
        <div>
          <SectionLabel>Document a security finding</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Every field below becomes part of the report record. Nothing here is discarded on submission.</p>
        </div>
        {program.programType === "vdp" && (
          <Alert tone="info" title="This is a vulnerability-disclosure program">
            It does not pay bounties. Your report is still reviewed and helps the organization fix the issue.
          </Alert>
        )}
        {standing && <SubmissionStandingPanel standing={standing} />}
        <CreateReportForm organizationId={organizationId} programId={programId} programName={program.name} inScopeTargets={inScopeTargets} policy={policy} initialDraft={initialDraft} savedTemplates={savedTemplates} captcha={standing && (standing.tier === "new" || standing.tier === "limited") ? captchaConfig() : { provider: "none" }} />
      </div>
    </AppShell>
  );
}
