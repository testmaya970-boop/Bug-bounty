import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { Card, EmptyState, PermissionDenied } from "../../../../../components/ui/feedback";
import { AssetTypeBadge, ProgramStatusBadge, ProgramTypeBadge, ResearcherStatusBadge } from "../../../../../components/ui/badge";
import { AddScopeEntryDialog } from "../../../../../components/programs/add-scope-entry-dialog";
import { ImportScopeDialog } from "../../../../../components/programs/import-scope-dialog";
import { ExportScopeButton } from "../../../../../components/programs/export-scope-button";
import { ScopeEntryCard } from "../../../../../components/programs/scope-entry-card";
import { ResearcherScopeView } from "../../../../../components/programs/researcher-scope-view";
import { InviteResearcherDialog } from "../../../../../components/programs/invite-researcher-dialog";
import { ResearcherTable } from "../../../../../components/programs/researcher-table";
import { PendingProgramInvitationsPanel } from "../../../../../components/programs/pending-program-invitations-panel";
import { BountyPolicySection, CreateBountyPolicyDialog } from "../../../../../components/programs/bounty-policy";
import { ProgramPolicySummary } from "../../../../../components/programs/program-policy";
import { PublishProgramPolicyDialog } from "../../../../../components/programs/program-policy-editor";
import { getProgramPolicy } from "../../../../../services/program-policy";
import { PublicProgramTerms } from "../../../../../components/programs/public-program-terms";
import { getProgramAccessFile } from "../../../../../services/program-access-file";
import { JoinPublicProgramButton } from "../../../../../components/programs/join-public-program-button";
import { AccessRequestsPanel, RequestToJoinPanel } from "../../../../../components/programs/program-access-request";
import { getProgramJoinInfo, listProgramAccessRequests } from "../../../../../services/program-access";
import { ProgramHealthSection } from "../../../../../components/programs/program-health-section";
import { ProgramReportList } from "../../../../../components/reports/program-report-list";
import { PrimaryActionPanel, RegistryList, SectionLabel } from "../../../../../components/ui/security-primitives";
import { ProgramAccessInstructionsNotice } from "../../../../../components/programs/program-access-instructions-panel";
import { ProgramAccessFileNotice } from "../../../../../components/programs/program-access-file-panel";
import { ProgramLifecycleControls } from "../../../../../components/programs/program-lifecycle-controls";
import { ProgramHeader } from "../../../../../components/programs/program-header";
import { canCreateProgram } from "../../../../../services/authorization";
import { getActorMembership } from "../../../../../services/organization-members";
import { getProgram, getProgramAccessInstructions, getPublicProgram, listProgramMembers, listProgramsForOrganization, listPublicProgramScope } from "../../../../../services/programs";
import { getProgramResolutionPerformance, getProgramSeverityStatusBreakdown, getProgramWeeklyReportVolume } from "../../../../../services/program-analytics";
import { listActiveScopeEntries } from "../../../../../services/scope";
import { getMyParticipation, listMyProgramParticipations, listPendingProgramInvitations, listProgramResearchers, suggestProgramResearchers, type SuggestedResearcher } from "../../../../../services/program-researchers";
import { SuggestedResearchers } from "../../../../../components/programs/suggested-researchers";
import type { ProgramInvitationRecord, ProgramResearcherRecord } from "../../../../../types/researcher";
import { listReportsForProgram } from "../../../../../services/reports";
import { getEffectiveBountyPolicy } from "../../../../../services/bounty";
import { getCurrentUser } from "../../../../../lib/auth/current-user";
import { perfTimed } from "../../../../../lib/perf-trace";
import type { ScopeState } from "../../../../../types/scope";
import type { OrganizationResolutionPerformance, OrganizationSeverityStatusCount, OrganizationWeeklyReportVolume } from "../../../../../types/organization";
import { LocalTime } from "../../../../../components/ui/local-time";
import { BountyTiersPanel } from "../../../../../components/organizations/asset-tier-control";

const SCOPE_FILTERS: { value: "all" | ScopeState; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_scope", label: "In scope" },
  { value: "out_of_scope", label: "Out of scope" },
];

export default async function ProgramControlCenterPage(props: {
  params: Promise<{ organizationId: string; programId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  return perfTimed("route: program home (total)", () => renderProgramControlCenterPage(props));
}

async function renderProgramControlCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; programId: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { organizationId, programId } = await params;
  const { scope: scopeFilterParam } = await searchParams;
  const user = await getCurrentUser();

  // Anonymous visitor: only a program that is genuinely public AND active/paused is
  // ever shown here (see docs/decisions/0041) -- get_public_program independently
  // re-verifies visibility/status server-side, so this branch cannot be tricked into
  // exposing a private or draft program regardless of what this page believes. Anything
  // else (private, draft, review, closed, or a genuinely nonexistent id) falls through
  // to the identical sign-in redirect every anonymous visitor already got before this
  // slice -- no new information is revealed by the branch itself.
  if (!user) {
    const publicProgram = await getPublicProgram(programId);
    if (!publicProgram || publicProgram.organizationId !== organizationId) {
      redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}` as Route);
    }
    const [publicScope, policy] = await Promise.all([listPublicProgramScope(programId), getProgramPolicy(programId)]);
    const inScope = publicScope.filter((entry) => entry.scopeState === "in_scope");
    const outOfScope = publicScope.filter((entry) => entry.scopeState === "out_of_scope");

    return (
      <div className="min-h-dvh bg-canvas text-ink">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <Link prefetch={false} href="/" className="text-lg font-bold tracking-tight">
              Unpatched
            </Link>
            <Link prefetch={false} href="/sign-in" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Sign in
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl space-y-9 px-4 py-12 sm:px-6">
          <div>
            <SectionLabel>{publicProgram.organizationName}</SectionLabel>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{publicProgram.name}</h1>
              <ProgramStatusBadge status={publicProgram.status} />
              <ProgramTypeBadge programType={publicProgram.programType} />
            </div>
            {publicProgram.description && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-ink-muted">{publicProgram.description}</p>}
              <PublicProgramTerms program={publicProgram} />
              <div className="mt-5 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-ink">Program policy</h2>
                <div className="mt-2">
                  <ProgramPolicySummary policy={policy} />
                </div>
              </div>
          </div>

          {/* CAN I RESEARCH THIS — the primary action, placed immediately after identity,
              never buried below the scope listing (see docs/decisions/0043). */}
          <div className="rounded-lg bg-ink px-6 py-6 text-canvas sm:px-7">
            <p className="font-mono text-[11px] font-semibold text-canvas/55">Can I research this?</p>
            {publicProgram.programType === "vdp" && (
              <p className="mt-2 text-sm text-canvas/70">This is a vulnerability-disclosure program: it does not pay bounties. Reports are still welcome and reviewed.</p>
            )}
            {publicProgram.status === "active" ? (
              <>
                <p className="mt-2 text-sm text-canvas/70">This program is open to the community. Sign in, or create a researcher account, to submit a report against the scope below.</p>
                <Link prefetch={false}
                  href={`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}` as Route}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-md bg-canvas px-5 text-sm font-semibold text-ink transition hover:bg-canvas/90 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas"
                >
                  Sign in to participate <span aria-hidden="true">→</span>
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-canvas/70">This program is paused. Its scope is shown below for reference, but reports cannot be submitted while it is not active.</p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Scope</h2>
            <p className="text-sm text-ink-muted">
              Only targets explicitly marked <span className="font-medium text-ink">in scope</span> below are authorized for testing. An unlisted asset is not implicitly in scope.
            </p>
            {inScope.length === 0 ? (
              <EmptyState title="No in-scope targets listed">This program has not published any in-scope targets yet.</EmptyState>
            ) : (
              <RegistryList>
                {inScope.map((entry) => (
                  <li key={entry.id} className="p-3">
                    <span className="break-all font-mono text-sm text-ink">{entry.displayTarget}</span>
                    {entry.description && <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>}
                  </li>
                ))}
              </RegistryList>
            )}
          </div>

          {outOfScope.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Out of scope</h2>
              <RegistryList>
                {outOfScope.map((entry) => (
                  <li key={entry.id} className="p-3">
                    <span className="break-all font-mono text-sm text-ink">{entry.displayTarget}</span>
                    {entry.description && <p className="mt-1 text-sm text-ink-muted">{entry.description}</p>}
                  </li>
                ))}
              </RegistryList>
            </div>
          )}
        </main>
        <footer className="border-t border-border px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
            <span>Unpatched</span>
            <Link prefetch={false} href="/sign-in" className="font-medium hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    );
  }

  const [program, myParticipation] = await Promise.all([getProgram(programId), getMyParticipation(user.id, programId)]);

  // A null `program` covers "does not exist" and "exists but you have no access"
  // identically for anyone with no relationship to it at all -- RLS already made that
  // decision, and this must not narrow it into a distinguishing message (SECURITY.md:
  // private program existence is not revealed). A program id that resolves under a
  // different organization in the URL is treated the same way.
  //
  // But `programs`/`program_scope_entries` RLS only grants a researcher direct read
  // access while their participation is 'active' (private.is_researcher_authorized_for_program,
  // 202608260006) -- a suspended or revoked researcher's OWN program_researchers row is
  // still readable to them (getMyParticipation has no such status gate), so `program` can
  // be null here for someone who genuinely has, or once had, a real relationship to this
  // program. Treating that identically to a total stranger would hide their own access
  // state from them, which is exactly what section 4 of this task requires be shown.
  // `list_my_program_participations` (used by /programs) still carries the program's name
  // for an active-or-suspended participant; it excludes 'revoked' entirely (a disclosed
  // backend gap -- see the final report), so a revoked researcher is shown their own
  // known status without a fabricated program name.
  if (!program || program.organizationId !== organizationId) {
    if (myParticipation && myParticipation.organizationId === organizationId) {
      const participations = await listMyProgramParticipations();
      const recovered = participations.find((p) => p.programId === programId);
      const { items: ownReports, nextCursor: ownReportsCursor } = await listReportsForProgram(programId);

      return (
        <AppShell title={recovered?.programName ?? "Program"} user={user} organizationId={organizationId}>
          <div className="space-y-6">
            <Breadcrumbs items={[{ label: "Programs", href: "/programs" }, { label: recovered?.programName ?? "Program" }]} />

            <div className="border-b border-border pb-5">
              <div className="flex flex-wrap items-center gap-3">
                <SectionLabel>Program</SectionLabel>
                {recovered && <ProgramStatusBadge status={recovered.programStatus} />}
              </div>
              {recovered && <p className="mt-1 text-sm text-ink-muted">{recovered.organizationName}</p>}
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                Your access: <ResearcherStatusBadge status={myParticipation.status} />
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {myParticipation.status === "suspended"
                  ? "Your access to this program has been suspended. You cannot currently view its scope or submit new reports. Reports you already submitted remain visible below."
                  : "You no longer have access to this program. You cannot view its scope or submit new reports. Reports you already submitted remain visible below."}
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Your reports</h2>
              {ownReports.length === 0 ? (
                <EmptyState title="No reports yet">Reports you submitted to this program while you had access will appear here.</EmptyState>
              ) : (
                <ProgramReportList organizationId={organizationId} programId={programId} initialReports={ownReports} initialNextCursor={ownReportsCursor} />
              )}
            </div>
          </div>
        </AppShell>
      );
    }

    // A signed-in visitor with no relationship at all (not org admin, not program_members,
    // no program_researchers row) fails the same RLS predicate an anonymous visitor does
    // -- `programs`/`program_scope_entries` RLS was deliberately not widened for this
    // slice (see docs/decisions/0041). So a genuinely public program still needs its own
    // check here: get_public_program is granted to `authenticated` too, and re-verifies
    // visibility/status server-side independently of anything this branch assumes.
    const [publicProgram, joinInfo] = await Promise.all([getPublicProgram(programId), getProgramJoinInfo(programId)]);
    if (publicProgram && publicProgram.organizationId === organizationId) {
      // Staff of the owning organization land here too (billing admins, triagers of other
      // programs) -- they are not offered "Start researching": 202609280001 refuses it.
      const [publicScope, staffMembership, policy] = await Promise.all([listPublicProgramScope(programId), getActorMembership(user.id, organizationId), getProgramPolicy(programId)]);
      const isOwnStaff = Boolean(staffMembership && staffMembership.status !== "removed");
      const inScope = publicScope.filter((entry) => entry.scopeState === "in_scope");
      const outOfScope = publicScope.filter((entry) => entry.scopeState === "out_of_scope");

      return (
        <AppShell title={publicProgram.name} user={user} organizationId={organizationId}>
          <div className="mx-auto max-w-3xl space-y-8">
            <Breadcrumbs items={[...(isOwnStaff ? [{ label: "Organizations", href: "/organizations" }] : []), { label: "Programs", href: "/programs" }, { label: publicProgram.name }]} />
            <div>
              {/* The program name is AppShell's own <h1> (title={publicProgram.name}); it
                  is not repeated here as a second h1. */}
              <div className="flex flex-wrap items-center gap-3">
                <SectionLabel>{publicProgram.organizationName}</SectionLabel>
                <ProgramStatusBadge status={publicProgram.status} />
                <ProgramTypeBadge programType={publicProgram.programType} />
              </div>
              {publicProgram.description && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-ink-muted">{publicProgram.description}</p>}
              <PublicProgramTerms program={publicProgram} />
              <div className="mt-5 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-ink">Program policy</h2>
                <div className="mt-2">
                  <ProgramPolicySummary policy={policy} />
                </div>
              </div>
            </div>

            {/* CAN I RESEARCH THIS — placed immediately after identity, never buried
                below the scope listing (see docs/decisions/0043). */}
            <div className="rounded-lg bg-ink px-6 py-6 text-canvas sm:px-7">
              <p className="font-mono text-[11px] font-semibold text-canvas/55">Can I research this?</p>
              <p className="mt-2 text-sm text-canvas/70">{joinInfo?.joinMode === "request" ? "This program is public and reviews who joins." : "This program is open to the community."}</p>
              {publicProgram.programType === "vdp" && (
                <p className="mt-2 text-sm text-canvas/70">This is a vulnerability-disclosure program: it does not pay bounties. Reports are still welcome and reviewed.</p>
              )}
              {isOwnStaff ? (
                <p className="mt-2 text-sm text-canvas/70">You are on this organization&apos;s team, so you can&apos;t research its programs.</p>
              ) : user.accountType === "organization" ? (
                // Two-sided accounts: the database refuses an organization account joining,
                // so it is never offered the button (it used to click through to a raw error).
                <p className="mt-2 text-sm text-canvas/70">Organization accounts can&apos;t research programs. Researchers join from their own researcher account.</p>
              ) : publicProgram.status === "active" ? (
                <>
                  {joinInfo && (joinInfo.minValidReports || joinInfo.minSignal != null) && (
                    <p className="mt-2 text-sm text-canvas/70">
                      To join on your own you need {[joinInfo.minValidReports ? `${joinInfo.minValidReports} valid reports` : null, joinInfo.minSignal != null ? `a signal of ${joinInfo.minSignal > 0 ? "+" : ""}${joinInfo.minSignal.toFixed(2)} or better` : null].filter(Boolean).join(" and ")}. Invited researchers aren&apos;t held to this.
                    </p>
                  )}
                  {joinInfo?.joinMode === "request" ? (
                    <RequestToJoinPanel organizationId={organizationId} programId={programId} info={joinInfo} />
                  ) : (
                    <div className="mt-4">
                      <JoinPublicProgramButton organizationId={organizationId} programId={programId} />
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-canvas/70">Reports cannot be submitted while this program is not active.</p>
              )}
            </div>

            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Scope</h2>
              {inScope.length === 0 ? (
                <EmptyState title="No in-scope targets listed">This program has not published any in-scope targets yet.</EmptyState>
              ) : (
                <RegistryList>
                  {inScope.map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1.5 p-3">
                      <AssetTypeBadge assetType={entry.assetType} />
                      <div className="min-w-0">
                        <span className="break-all font-mono text-sm text-ink">{entry.displayTarget}</span>
                        {entry.description && <p className="mt-0.5 text-sm text-ink-muted">{entry.description}</p>}
                      </div>
                    </li>
                  ))}
                </RegistryList>
              )}
            </div>

            {outOfScope.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-ink">Out of scope</h2>
                <RegistryList>
                  {outOfScope.map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1.5 p-3">
                      <AssetTypeBadge assetType={entry.assetType} />
                      <div className="min-w-0">
                        <span className="break-all font-mono text-sm text-ink">{entry.displayTarget}</span>
                        {entry.description && <p className="mt-0.5 text-sm text-ink-muted">{entry.description}</p>}
                      </div>
                    </li>
                  ))}
                </RegistryList>
              </div>
            )}
          </div>
        </AppShell>
      );
    }

    return (
      <AppShell title="Program" user={user} organizationId={organizationId}>
        <PermissionDenied>This program does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  // Three distinct viewers can reach this point (see docs/decisions/0007-researcher-access.md):
  // an org owner/security admin (oversight), a program_members manager, or an active
  // researcher. Which one determines the entire page below -- manager-facing content
  // (the roster, invitations, other researchers' identities) is never shown to a
  // researcher, per the task's data-confidentiality requirement. This first stage is a
  // genuine, unavoidable sequential dependency: canManageProgram/isActiveResearcher gate
  // every read below (whether to fetch the manager-only roster at all), so nothing after
  // it can start until this resolves.
  const [members, actorMembership] = await perfTimed("program home: stage 1 (membership)", () => Promise.all([listProgramMembers(programId), getActorMembership(user.id, organizationId)]));
  // program_members (202609250012): "manager" runs the program; any assignment, including
  // "triager", works its reports. The database enforces the same split.
  const isProgramManager = members.some((member) => member.userId === user.id && member.role === "manager");
  const isProgramTriager = members.some((member) => member.userId === user.id);
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  const canManageProgram = isProgramManager || isOrgAdmin;
  // Researchers reach this page too: their way back is Programs, not the org trail they
  // can't open.
  const isOrgStaff = Boolean(actorMembership && actorMembership.status === "active");
  const isActiveResearcher = myParticipation?.status === "active";

  // Phase 8 perf fix: this used to be six sequential await stages (scopeEntries, then
  // researchers/pendingInvitations, then focusAreas, then reports, then bountyPolicy,
  // then the analytics batch) even though NONE of them have a real data dependency on
  // each other -- every one of them depends only on canManageProgram/isActiveResearcher,
  // both already known above. Collapsed into one Promise.all so the whole page pays for
  // exactly the slowest single query in this batch, not the sum of all of them.
  const policyPromise = getProgramPolicy(programId);
  const [scopeEntries, accessFile, accessInstructions, [researchers, pendingInvitations, accessRequests, suggestedResearchers], { items: reports, nextCursor: nextCursorPreview }, bountyPolicy, [severityStatusBreakdown, weeklyVolume, resolutionPerformance], organizationPrograms] =
    await perfTimed("program home: stage 2 (parallel batch)", () =>
      Promise.all([
        listActiveScopeEntries(programId),
        // Same RLS-scoped read for either viewer as scopeEntries above -- a manager or an
        // INVITED (never a self-enrolled public-program) researcher can read the row;
        // anyone else gets null. See db/migrations/202609240004_program_access_invitation_only.sql.
        getProgramAccessFile(programId),
        // Invitation-only read, deliberately separate from `program.description` --
        // see the same migration and getProgramAccessInstructions' own comment.
        getProgramAccessInstructions(programId),
        // Pilot suggestions (202610230006): private programs that can still take researchers.
        canManageProgram
          ? Promise.all([listProgramResearchers(programId), listPendingProgramInvitations(programId), listProgramAccessRequests(programId), program.visibility === "private" && program.status !== "closed" ? suggestProgramResearchers(programId) : Promise.resolve([] as SuggestedResearcher[])])
          : Promise.resolve([[], [], [], []] as [ProgramResearcherRecord[], ProgramInvitationRecord[], Awaited<ReturnType<typeof listProgramAccessRequests>>, SuggestedResearcher[]]),
        // RLS already scopes this correctly per viewer: a manager sees every report for
        // the program, a researcher sees only their own (researcher_id = auth.uid()) --
        // the same query, deliberately, rather than two different reads for the same
        // table. A manager only ever sees a small preview here (limit 5) -- the full,
        // filterable, paginated list lives at the dedicated triage inbox route this page
        // links to; a researcher's own report count on one program is small enough that
        // the default page size is fine.
        listReportsForProgram(programId, undefined, canManageProgram || isProgramTriager ? 5 : undefined),
        // RLS scopes this identically for a manager or an active, authorized researcher --
        // the same transparency every bounty program studied publishes. See
        // docs/decisions/0013-bounty-decision-engine.md.
        canManageProgram || isActiveResearcher ? getEffectiveBountyPolicy(programId) : Promise.resolve(null),
        // Same two-path authorization the underlying RPCs enforce themselves
        // (private.authorize_program_analytics_read: has_org_role(owner/security_admin)
        // OR is_program_member) -- canManageProgram already covers is_program_member/
        // isOrgAdmin, so this is deliberately the SAME gate as Bounty policy above, not
        // narrowed to owner/security_admin only. An authorized researcher sees the same
        // read-only health signal a manager does, matching bounty policy's own existing
        // transparency precedent on this page.
        canManageProgram || isActiveResearcher
          ? Promise.all([getProgramSeverityStatusBreakdown(programId), getProgramWeeklyReportVolume(programId), getProgramResolutionPerformance(programId)])
          : Promise.resolve([[], [], null] as [OrganizationSeverityStatusCount[], OrganizationWeeklyReportVolume[], OrganizationResolutionPerformance | null]),
        // Program switcher's own data (item 11, Turn 6) -- manager/admin only, matching
        // every other manager-gated fetch in this batch; fetch ownership rule means this
        // page fetches it, never ProgramHeader itself.
        canManageProgram ? listProgramsForOrganization(organizationId) : Promise.resolve([]),
        // Program team panel's assignable people (202609250012) -- org admins only, the
        // only role allowed to assign.
      ]),
    );
  const policy = await policyPromise;
  // Scope editing is no longer locked to draft (202609230001_scope_editable_after_launch):
  // an org can still fix a scope mistake, add a target, or retire one after review/launch.
  // Reaching this page as a manager already proves the identical authorization predicate
  // scope mutation uses, which the database independently re-enforces regardless of this
  // flag -- lifecycle status is no longer part of that check on either side.
  // Except during launch review (202610120001): what the platform admin approves must be what goes live.
  const canManageScope = canManageProgram && program.status !== "review";

  const scopeFilter: "all" | ScopeState = scopeFilterParam === "in_scope" || scopeFilterParam === "out_of_scope" ? scopeFilterParam : "all";
  const filteredScopeEntries = scopeFilter === "all" ? scopeEntries : scopeEntries.filter((entry) => entry.scopeState === scopeFilter);

  return (
    // AppShell's title is the page-level landmark, not a second copy of the program
    // name -- ProgramHeader's own h2, right below, already shows it once (matches the
    // triage inbox's own precedent of a section title, e.g. "Triage inbox", never a
    // repeated entity name).
    <AppShell title={isOrgStaff ? "Overview" : "Program"} user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs
          items={
            isOrgStaff
              ? [{ label: "Organizations", href: "/organizations" }, { label: "Engagements", href: `/organizations/${organizationId}/programs` }, { label: program.name }]
              : [{ label: "Programs", href: "/programs" }, { label: program.name }]
          }
        />

        <ProgramHeader
          organizationId={organizationId}
          programId={programId}
          programName={program.name}
          status={program.status}
          programType={program.programType}
          active="overview"
          canManage={canManageProgram}
          canWorkReports={canManageProgram || isProgramTriager}
          siblingPrograms={canManageProgram ? organizationPrograms.filter((p) => p.id !== programId).map((p) => ({ id: p.id, name: p.name, status: p.status })) : undefined}
        />

        {canManageProgram ? (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">Created by</dt>
              <dd className="mt-0.5 font-medium text-ink">{program.createdByName}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Created</dt>
              <dd className="mt-0.5 font-medium text-ink"><LocalTime value={program.createdAt} dateOnly /></dd>
            </div>
            <div>
              <dt className="text-ink-muted">Program managers</dt>
              <dd className="mt-0.5 font-medium text-ink">{members.length === 0 ? "None" : members.map((member) => member.displayName).join(", ")}</dd>
            </div>
          </dl>
        ) : (
          myParticipation && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              Your access: <ResearcherStatusBadge status={myParticipation.status} />
            </p>
          )
        )}
        {/* A draft's next step stays here; pausing and closing live in Settings. */}
        {canManageProgram && program.status === "draft" && <ProgramLifecycleControls organizationId={organizationId} programId={programId} status={program.status} />}
        {canManageProgram && program.status === "review" && <p className="text-sm text-ink-muted">Awaiting platform review: Unpatched checks it before it goes live.</p>}
        {canManageProgram && program.status === "suspended" && (
          <p role="status" className="text-sm font-medium text-danger">
            Suspended by the platform: hidden from researchers. Contact support to reinstate it.
          </p>
        )}

        {/* CAN I RESEARCH THIS — the researcher's own primary action, placed
            immediately after identity, never buried below scope/reports (see
            docs/decisions/0043). Never shown to a manager, who has their own
            program-management actions instead. */}
        {!canManageProgram && isActiveResearcher && (
          <>
            {program.status === "active" ? (
              <PrimaryActionPanel
                eyebrow="Can I research this?"
                title="Found something? Report it."
                description="Submit a finding against this program's in-scope targets below."
                href={`/organizations/${organizationId}/programs/${programId}/reports/new` as Route}
                actionLabel="Report a vulnerability"
              />
            ) : (
              <div className="rounded-lg bg-ink px-6 py-6 text-canvas sm:px-7">
                <p className="font-mono text-[11px] font-semibold text-canvas/55">Can I research this?</p>
                <p className="mt-2 text-sm text-canvas/70">
                  This program is currently <span className="font-semibold text-canvas">{program.status}</span> and is not accepting new reports right now.
                </p>
              </div>
            )}
          </>
        )}

        {/* Public programs have no invitation gate at all -- join_public_program lets any
            active, non-suspended Unpatched account self-enroll (202608310002). Access
            instructions/files exist for the invitation-only trust model 0007 describes;
            showing them to a self-enrolled researcher on a public program would hand a
            VPN config or internal contact to literally anyone who clicks "Join", not to
            someone the org actually vetted. So this notice only ever renders for a
            private program, regardless of researcher status. */}
        {!canManageProgram && isActiveResearcher && program.visibility === "private" && (
          <>
            <ProgramAccessInstructionsNotice accessInstructions={accessInstructions} />
            <ProgramAccessFileNotice organizationId={organizationId} programId={programId} file={accessFile} />
          </>
        )}

        <div id="scope" className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Scope</h2>
              <p className="text-sm text-ink-muted">This defines what researchers are permitted to test.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportScopeButton entries={scopeEntries} programName={program.name} />
              {canManageScope && <ImportScopeDialog organizationId={organizationId} programId={programId} />}
              {canManageScope && <AddScopeEntryDialog organizationId={organizationId} programId={programId} />}
            </div>
          </div>

          {!canManageProgram && isActiveResearcher && (
            <p className="text-sm text-ink-muted">
              Only targets explicitly marked <span className="font-medium text-ink">In scope</span> below are authorized for testing. A target that is not listed here is not in scope. The program does not treat an
              unlisted asset as implicitly allowed, and a report against it will be rejected at submission.
            </p>
          )}

          {canManageProgram ? (
            <>
              {scopeEntries.length > 0 && (
                <nav aria-label="Filter scope by state" className="flex flex-wrap gap-2">
                  {SCOPE_FILTERS.map((filter) => (
                    <Link prefetch={false}
                      key={filter.value}
                      href={(filter.value === "all" ? `/organizations/${organizationId}/programs/${programId}` : `/organizations/${organizationId}/programs/${programId}?scope=${filter.value}`) as Route}
                      // A real bug, not cosmetic: without this, clicking a scope filter is a
                      // real navigation to a new URL (different query string, same route),
                      // and Next.js's default post-navigation behavior scrolls to the very
                      // top of the page -- yanking the researcher away from the Scope section
                      // they were just looking at. `scroll={false}` keeps the current scroll
                      // position exactly where it was, since the filter buttons themselves
                      // stay in the same place regardless of which filter is active.
                      scroll={false}
                      aria-current={scopeFilter === filter.value ? "true" : undefined}
                      className={`min-h-11 inline-flex items-center rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                        scopeFilter === filter.value ? "bg-surface-muted text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                      }`}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </nav>
              )}

              {scopeEntries.length === 0 ? (
                <EmptyState title="No scope assets have been added">
                  This defines what researchers are permitted to test. {canManageScope ? "Add a domain, URL, or IP/CIDR range to get started." : "None have been added yet."}
                </EmptyState>
              ) : filteredScopeEntries.length === 0 ? (
                <EmptyState title="No matching scope entries">No scope entries match this filter.</EmptyState>
              ) : (
                <RegistryList>
                  {filteredScopeEntries.map((entry) => (
                    <li key={entry.id}>
                      <ScopeEntryCard organizationId={organizationId} programId={programId} entry={entry} canManage={canManageScope} />
                    </li>
                  ))}
                </RegistryList>
              )}
            </>
          ) : (
            // The hacker-facing view: in-scope assets grouped by type with per-asset
            // instructions, distinct from the manager's own flat/filterable registry
            // above. See ResearcherScopeView's own comment for why these are two
            // different components rather than one conditionally-rendered layout.
            <ResearcherScopeView entries={scopeEntries} />
          )}
        </div>

        {canManageProgram && (
          <div id="researchers" className="scroll-mt-20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Researcher access</h2>
                <p className="text-sm text-ink-muted">Who is authorized to test this program. Invited researchers get no organization access and no access to other programs.</p>
              </div>
              <InviteResearcherDialog organizationId={organizationId} programId={programId} />
            </div>
            <AccessRequestsPanel organizationId={organizationId} programId={programId} requests={accessRequests} />
            {pendingInvitations.length > 0 && <PendingProgramInvitationsPanel organizationId={organizationId} programId={programId} invitations={pendingInvitations} />}
            <SuggestedResearchers organizationId={organizationId} programId={programId} researchers={suggestedResearchers} />
            {researchers.length === 0 ? (
              <EmptyState title="No researchers are currently participating">Invite a researcher to get started.</EmptyState>
            ) : (
              <div className="rounded-lg border border-border bg-surface">
                <ResearcherTable organizationId={organizationId} programId={programId} researchers={researchers} />
              </div>
            )}
          </div>
        )}

        {(canManageProgram || isActiveResearcher) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Program policy</h2>
                <p className="text-sm text-ink-muted">
                  {canManageProgram ? "What researchers agree to before submitting. Each publish is a new version; reports keep the version they were submitted under." : "The rules you agreed to research under."}
                </p>
              </div>
              {canManageProgram && <PublishProgramPolicyDialog organizationId={organizationId} programId={programId} current={policy} />}
            </div>
            <Card className="space-y-3 p-5">
              {!canManageProgram && program.description && <p className="whitespace-pre-wrap text-sm text-ink">{program.description}</p>}
              <ProgramPolicySummary policy={policy} />
            </Card>
          </div>
        )}

        {(canManageProgram || isActiveResearcher) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Bounty policy</h2>
                <p className="text-sm text-ink-muted">
                  {program.programType === "vdp" ? "This is a vulnerability-disclosure-only program. It does not pay bounties." : "What severity pays what, for a resolved report in this program."}
                </p>
              </div>
              {canManageProgram && program.programType !== "vdp" && <CreateBountyPolicyDialog organizationId={organizationId} programId={programId} currentPolicy={bountyPolicy} />}
            </div>
            {program.programType !== "vdp" && (
              <Card className="p-5">
                <BountyPolicySection policy={bountyPolicy} />
                {canManageProgram && <BountyTiersPanel organizationId={organizationId} programId={programId} tier2Percent={program.bountyTier2Percent ?? 100} tier3Percent={program.bountyTier3Percent ?? 100} />}
              </Card>
            )}
          </div>
        )}

        {(canManageProgram || isActiveResearcher) && resolutionPerformance && (
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Program health</h2>
              <p className="text-sm text-ink-muted">Real report activity and resolution performance for this program.</p>
            </div>
            {severityStatusBreakdown.length === 0 ? (
              <EmptyState title="No analytics yet">Analytics fill in once this program has received at least one report.</EmptyState>
            ) : (
              <ProgramHealthSection severityStatusBreakdown={severityStatusBreakdown} weeklyVolume={weeklyVolume} resolutionPerformance={resolutionPerformance} />
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Reports</h2>
              <p className="text-sm text-ink-muted">{canManageProgram ? "Every report submitted to this program." : "Reports you have submitted to this program."}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManageProgram && reports.length > 0 && (
                <Link prefetch={false}
                  href={`/organizations/${organizationId}/programs/${programId}/reports` as Route}
                  className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Open triage inbox
                </Link>
              )}
            </div>
          </div>
          {reports.length === 0 ? (
            <EmptyState title="No reports yet">
              {canManageProgram
                ? "Reports researchers submit against this program's scope will appear here."
                : isActiveResearcher
                  ? "Reports you submit against this program's scope will appear here."
                  : "This program has no reports visible to you yet."}
            </EmptyState>
          ) : canManageProgram ? (
            <Card className="p-5">
              <p className="text-sm text-ink">
                {reports.length} recent report{reports.length === 1 ? "" : "s"}{nextCursorPreview ? "+" : ""} on this program.{" "}
                <Link prefetch={false} href={`/organizations/${organizationId}/programs/${programId}/reports` as Route} className="font-medium text-action hover:text-action-hover">
                  Open the triage inbox
                </Link>{" "}
                to filter, page through every report, and act on them.
              </p>
            </Card>
          ) : (
            <ProgramReportList organizationId={organizationId} programId={programId} initialReports={reports} initialNextCursor={nextCursorPreview} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
